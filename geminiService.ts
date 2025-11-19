import { GoogleGenAI, Type } from "@google/genai";
import { DocumentResult, FieldDefinition, ExtractedValue } from './types';
import { fileToBase64 } from './utils';

export const processDocument = async (
  doc: DocumentResult,
  fields: FieldDefinition[]
): Promise<Record<string, ExtractedValue>> => {
  
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 1. Construct Dynamic Schema
  const properties: Record<string, any> = {};
  
  fields.forEach(field => {
    properties[field.key] = {
      type: Type.OBJECT,
      properties: {
        value: { type: Type.STRING, description: `The extracted value for ${field.name}` },
        box_2d: { 
          type: Type.ARRAY, 
          items: { type: Type.INTEGER },
          description: "The bounding box of the value in [ymin, xmin, ymax, xmax] format (normalized 0-1000)."
        }
      },
      description: `Extraction result for ${field.name}`
    };
  });

  // 2. Prepare Prompt
  const base64DataUrl = await fileToBase64(doc.file);
  const base64Data = base64DataUrl.split(',')[1]; // Remove "data:image/xyz;base64," prefix

  const prompt = `
    You are an expert internal auditor. 
    Analyze the provided document.
    Extract the following fields: ${fields.map(f => f.name).join(', ')}.
    For each field, find the text value and the 2D bounding box coordinates.
    If a field is not found, return null for value.
    The bounding box should be normalized to a 0-1000 scale in [ymin, xmin, ymax, xmax] order.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: doc.file.type, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: properties,
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const json = JSON.parse(text);
    return json;

  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};
