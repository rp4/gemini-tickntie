import React, { useState, useEffect, useRef } from 'react';
import { DocumentResult, FieldDefinition } from '../types';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface DocumentViewerProps {
  document: DocumentResult;
  fields: FieldDefinition[];
  onClose: () => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ document: doc, fields, onClose }) => {
  const [scale, setScale] = useState(1);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset scale when doc changes
  useEffect(() => {
    setScale(1);
  }, [doc.id]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgSize({
      width: e.currentTarget.naturalWidth,
      height: e.currentTarget.naturalHeight,
    });
  };

  // Convert 1000-scale coordinates to percentages
  const getStyle = (box: number[] | undefined | null) => {
    if (!box || box.length !== 4) return { display: 'none' };
    const [ymin, xmin, ymax, xmax] = box;
    return {
      top: `${ymin / 10}%`,
      left: `${xmin / 10}%`,
      height: `${(ymax - ymin) / 10}%`,
      width: `${(xmax - xmin) / 10}%`,
    };
  };

  if (!doc.previewUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div>
            <h3 className="font-bold text-lg text-gray-800">{doc.fileName}</h3>
            <p className="text-sm text-gray-500">Extraction Verification</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-white border rounded-md">
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="p-2 hover:bg-gray-100">
                <ZoomOut size={20} />
              </button>
              <span className="px-2 text-sm font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="p-2 hover:bg-gray-100">
                <ZoomIn size={20} />
              </button>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Sidebar: Extracted Data List */}
          <div className="w-1/3 min-w-[300px] border-r bg-white overflow-y-auto p-6">
             <h4 className="font-semibold text-gray-700 mb-4 uppercase text-xs tracking-wider">Extracted Fields</h4>
             <div className="space-y-4">
               {fields.map(field => {
                 const extracted = doc.data[field.key];
                 const hasValue = extracted && extracted.value;
                 
                 return (
                   <div key={field.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                     <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-600">{field.name}</span>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: field.color }} />
                     </div>
                     <div className={`text-lg font-mono break-all ${hasValue ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                       {hasValue ? extracted.value : 'Not found'}
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>

          {/* Visualizer Area */}
          <div className="flex-1 bg-gray-100 overflow-auto relative flex items-center justify-center p-8">
            <div 
              className="relative shadow-lg transition-transform duration-200 origin-top-center"
              style={{ transform: `scale(${scale})` }}
            >
              <img 
                ref={imgRef}
                src={doc.previewUrl} 
                alt="Document Preview" 
                className="max-w-none bg-white"
                onLoad={handleImageLoad}
                style={{ maxHeight: 'none', maxWidth: '100%' }} 
                // In a real app, you'd likely want natural width, but max-width ensures it fits initially
              />

              {/* Bounding Boxes Layer */}
              <div className="absolute inset-0 pointer-events-none">
                {fields.map(field => {
                   const extracted = doc.data[field.key];
                   if (!extracted?.box_2d) return null;

                   return (
                     <div
                       key={field.id}
                       className="absolute border-[3px] rounded-sm transition-opacity duration-300"
                       style={{
                         ...getStyle(extracted.box_2d),
                         borderColor: field.color,
                         backgroundColor: `${field.color}20`, // 20 is hex alpha ~12%
                         boxShadow: `0 0 8px ${field.color}80`
                       }}
                     >
                        {/* Tooltip on hover of box */}
                        <div 
                          className="absolute -top-8 left-0 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 hover:opacity-100 pointer-events-auto transition-opacity z-10"
                          style={{ backgroundColor: field.color }}
                        >
                          {field.name}: {extracted.value}
                        </div>
                     </div>
                   );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
