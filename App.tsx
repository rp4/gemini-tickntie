import React, { useState, useCallback } from 'react';
import { Upload, Plus, Trash2, FileText, Play, Download, Eye, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { FieldDefinition, DocumentResult, COLORS } from './types';
import { sanitizeKey, getNextColor, renderPdfToImage, exportToZip } from './utils';
import { processDocument } from './geminiService';
import DocumentViewer from './components/DocumentViewer';
import { v4 as uuidv4 } from 'uuid';

const App: React.FC = () => {
  // --- State ---
  const [fields, setFields] = useState<FieldDefinition[]>([
    { id: '1', name: 'Invoice Number', key: 'invoice_number', color: COLORS[0] },
    { id: '2', name: 'Invoice Date', key: 'invoice_date', color: COLORS[1] },
    { id: '3', name: 'Total Amount', key: 'total_amount', color: COLORS[2] }
  ]);
  const [newFieldName, setNewFieldName] = useState('');
  const [documents, setDocuments] = useState<DocumentResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // --- Handlers ---

  const addField = () => {
    if (!newFieldName.trim()) return;
    setFields(prev => [
      ...prev,
      {
        id: uuidv4(),
        name: newFieldName,
        key: sanitizeKey(newFieldName),
        color: getNextColor(prev.length)
      }
    ]);
    setNewFieldName('');
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newDocs: DocumentResult[] = [];
      
      // Process file previews immediately
      const files = Array.from(e.target.files) as File[];
      for (const file of files) {
        try {
          // Generate preview (Image or PDF page 1)
          const previewUrl = await renderPdfToImage(file);
          
          newDocs.push({
            id: uuidv4(),
            file,
            fileName: file.name,
            fileType: file.type,
            previewUrl,
            status: 'idle',
            data: {}
          });
        } catch (err) {
          console.error("Failed to load preview for", file.name, err);
          // Add anyway but maybe with error state or generic icon
           newDocs.push({
            id: uuidv4(),
            file,
            fileName: file.name,
            fileType: file.type,
            previewUrl: null, // Fallback
            status: 'error',
            errorMsg: 'Could not generate preview',
            data: {}
          });
        }
      }
      setDocuments(prev => [...prev, ...newDocs]);
    }
  };

  const runExtraction = async () => {
    if (documents.length === 0) return;
    setIsProcessing(true);

    // Clone docs to update state
    const docsToProcess = [...documents];

    // Process sequentially (or parallel with limit, here sequentially for simplicity/rate limits)
    for (let i = 0; i < docsToProcess.length; i++) {
      const doc = docsToProcess[i];
      if (doc.status === 'success') continue; // Skip already done

      // Update status to processing
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'processing' } : d));

      try {
        const result = await processDocument(doc, fields);
        
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'success', data: result } : d
        ));
      } catch (err) {
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'error', errorMsg: 'Extraction failed' } : d
        ));
      }
    }

    setIsProcessing(false);
  };

  const handleExport = () => {
    exportToZip(fields, documents);
  };

  // --- Render ---

  const selectedDocument = documents.find(d => d.id === selectedDocId);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <FileText className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tick & Tie Auditor</h1>
            <p className="text-xs text-gray-500">AI-Powered Internal Audit Tool</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={runExtraction}
            disabled={isProcessing || documents.length === 0}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition shadow-sm
              ${isProcessing || documents.length === 0 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
            {isProcessing ? 'Processing...' : 'Run Extraction'}
          </button>
          <button 
            onClick={handleExport}
            disabled={documents.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition disabled:opacity-50"
          >
            <Download size={18} />
            Export ZIP
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar: Configuration */}
        <aside className="w-80 bg-white border-r flex flex-col overflow-hidden">
          <div className="p-6 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-1">1. Define Fields</h2>
            <p className="text-xs text-gray-500">What information do you need to extract?</p>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="space-y-3">
              {fields.map((field) => (
                <div key={field.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm group hover:border-indigo-300 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: field.color }}></div>
                    <span className="font-medium text-gray-700">{field.name}</span>
                  </div>
                  <button 
                    onClick={() => removeField(field.id)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t bg-gray-50">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addField()}
                placeholder="e.g. Vendor Name"
                className="flex-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button 
                onClick={addField}
                className="bg-gray-900 text-white p-2 rounded-md hover:bg-gray-800 transition"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
          
          {/* Upload Section */}
          <div className="p-8 pb-4">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-white hover:bg-gray-50 hover:border-indigo-400 transition group">
              <div className="flex items-center justify-center pt-5 pb-6">
                <div className="bg-indigo-50 p-3 rounded-full mb-3 group-hover:bg-indigo-100 transition">
                  <Upload className="text-indigo-600" size={24} />
                </div>
                <p className="mb-1 text-sm text-gray-500"><span className="font-semibold text-gray-900">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-gray-400">PDF, PNG, JPG (Max 10MB per file)</p>
              </div>
              <input type="file" className="hidden" multiple onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" />
            </label>
          </div>

          {/* Results Table */}
          <div className="flex-1 overflow-auto px-8 pb-8">
             <div className="bg-white border rounded-xl shadow-sm overflow-hidden min-h-[400px]">
               <table className="w-full text-left border-collapse">
                 <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold sticky top-0 z-10 shadow-sm">
                   <tr>
                     <th className="px-6 py-4 border-b w-16">View</th>
                     <th className="px-6 py-4 border-b">Document</th>
                     <th className="px-6 py-4 border-b w-32">Status</th>
                     {fields.map(field => (
                       <th key={field.id} className="px-6 py-4 border-b" style={{ borderTop: `3px solid ${field.color}` }}>
                         {field.name}
                       </th>
                     ))}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {documents.length === 0 ? (
                     <tr>
                       <td colSpan={fields.length + 3} className="px-6 py-20 text-center text-gray-400">
                         <div className="flex flex-col items-center">
                           <FileText size={48} className="mb-4 opacity-20" />
                           <p>No documents uploaded yet.</p>
                         </div>
                       </td>
                     </tr>
                   ) : (
                     documents.map((doc) => (
                       <tr key={doc.id} className="hover:bg-gray-50/80 transition group">
                         <td className="px-6 py-4">
                           <button 
                             onClick={() => setSelectedDocId(doc.id)}
                             className="text-gray-400 hover:text-indigo-600 transition"
                           >
                             <Eye size={20} />
                           </button>
                         </td>
                         <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                             {doc.previewUrl && (
                               <img src={doc.previewUrl} alt="thumb" className="w-10 h-10 object-cover rounded border" />
                             )}
                             <div>
                               <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]" title={doc.fileName}>{doc.fileName}</div>
                               <div className="text-xs text-gray-500">{doc.fileType.split('/')[1].toUpperCase()}</div>
                             </div>
                           </div>
                         </td>
                         <td className="px-6 py-4">
                           {doc.status === 'processing' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Loader2 size={12} className="mr-1 animate-spin" /> Processing</span>}
                           {doc.status === 'success' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={12} className="mr-1" /> Done</span>}
                           {doc.status === 'error' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><AlertCircle size={12} className="mr-1" /> Error</span>}
                           {doc.status === 'idle' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Ready</span>}
                         </td>
                         {fields.map(field => {
                           const val = doc.data[field.key];
                           return (
                             <td key={field.id} className="px-6 py-4 text-sm text-gray-700 font-mono">
                               {val?.value || '-'}
                             </td>
                           );
                         })}
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </main>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer 
          document={selectedDocument} 
          fields={fields} 
          onClose={() => setSelectedDocId(null)} 
        />
      )}
    </div>
  );
};

export default App;