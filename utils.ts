import { COLORS, DocumentResult, FieldDefinition } from './types';

// Access globals loaded via CDN
declare global {
  interface Window {
    pdfjsLib: any;
    XLSX: any;
    JSZip: any;
  }
}

export const sanitizeKey = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
};

export const getNextColor = (index: number): string => {
  return COLORS[index % COLORS.length];
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data: type prefix for API calls if needed, but usually keep it for previews
      resolve(result);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Renders the first page of a PDF to a Base64 Image URL.
 * Uses pdf.js global.
 */
export const renderPdfToImage = async (file: File): Promise<string> => {
  if (file.type.startsWith('image/')) {
    return fileToBase64(file);
  }

  if (file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);
    
    const scale = 1.5; // Good quality for preview
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Canvas context not available");

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return canvas.toDataURL('image/jpeg');
  }

  throw new Error('Unsupported file type for preview');
};

export const exportToZip = async (fields: FieldDefinition[], documents: DocumentResult[]) => {
  if (!window.XLSX || !window.JSZip) {
    console.error("Required libraries (SheetJS or JSZip) not loaded");
    alert("Export libraries are still loading. Please try again in a moment.");
    return;
  }

  const zip = new window.JSZip();
  const folderName = "source_documents";
  const docsFolder = zip.folder(folderName);

  // Handle duplicate filenames by creating a mapping from doc.id to unique filename in zip
  const filenameMap = new Map<string, string>();
  const usedFilenames = new Set<string>();

  documents.forEach(doc => {
    let name = doc.fileName;
    const lastDotIndex = name.lastIndexOf(".");
    let base = lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
    let ext = lastDotIndex !== -1 ? name.substring(lastDotIndex) : "";
    
    // Ensure unique filename
    let counter = 1;
    let uniqueName = name;
    while (usedFilenames.has(uniqueName)) {
      uniqueName = `${base}_${counter}${ext}`;
      counter++;
    }
    usedFilenames.add(uniqueName);
    filenameMap.set(doc.id, uniqueName);

    // Add file to zip folder
    if (docsFolder) {
      docsFolder.file(uniqueName, doc.file);
    }
  });

  // Prepare data headers
  const headers = [
    "File Name", 
    "Status", 
    ...fields.map(f => f.name), 
    ...fields.map(f => `${f.name} (Coords)`)
  ];

  // Prepare data rows
  const dataRows = documents.map(doc => {
    const row: Record<string, any> = {};
    // Use original filename for display, but link will use unique name
    row["File Name"] = doc.fileName; 
    row["Status"] = doc.status;
    
    fields.forEach(field => {
      const extracted = doc.data[field.key];
      row[field.name] = extracted?.value || '';
      row[`${field.name} (Coords)`] = extracted?.box_2d ? JSON.stringify(extracted.box_2d) : '';
    });
    return row;
  });

  // Create Worksheet
  const worksheet = window.XLSX.utils.json_to_sheet(dataRows, { header: headers });

  // Add Hyperlinks to "File Name" column (Column A / Index 0)
  // Iterate through rows to add the link
  const range = window.XLSX.utils.decode_range(worksheet['!ref']);
  
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    const docIndex = R - 1; // Adjust for header row
    if (docIndex < documents.length) {
      const doc = documents[docIndex];
      const uniqueName = filenameMap.get(doc.id);
      
      if (uniqueName) {
        const cellRef = window.XLSX.utils.encode_cell({ c: 0, r: R }); // Column 0
        if (!worksheet[cellRef]) {
            worksheet[cellRef] = { t: 's', v: doc.fileName };
        }
        // Set hyperlink to relative path inside zip
        worksheet[cellRef].l = { Target: `${folderName}/${uniqueName}` };
      }
    }
  }

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Data");
  
  // Write Excel to buffer
  const excelBuffer = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  
  // Add Excel to Zip root
  zip.file("Audit_Report.xlsx", excelBuffer);

  // Generate and Download Zip
  try {
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "TickAndTie_Audit_Package.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to generate zip", error);
    alert("Failed to generate ZIP file.");
  }
};