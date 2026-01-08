'use client';

import { useState, useEffect } from 'react';

interface DocumentInfo {
  fileId: string;
  name?: string;
  title?: string;
  mimeType?: string;
  modifiedTime?: string;
  chunkCount?: number;
}

export default function DocumentBrowser() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      // IMPORTANT: Query Pinecone directly, not Google Drive
      console.log('[DocumentBrowser] Fetching documents from Pinecone via /api/documents/list');
      const response = await fetch('/api/documents/list', {
        cache: 'no-store', // Prevent caching
      });
      console.log('[DocumentBrowser] Response status:', response.status);
      
      const data = await response.json();
      console.log('[DocumentBrowser] Response data:', data);
      
      if (response.ok && data.success) {
        if (data.documents && data.documents.length > 0) {
          // Convert to DocumentInfo format
          const docInfos: DocumentInfo[] = data.documents.map((doc: any) => ({
            fileId: doc.fileId,
            name: doc.title,
            title: doc.title,
            mimeType: doc.mimeType,
            modifiedTime: doc.modifiedTime,
            chunkCount: doc.chunkCount,
          }));
          console.log('[DocumentBrowser] Loaded', docInfos.length, 'documents');
          setDocuments(docInfos);
        } else {
          // No documents found
          console.log('[DocumentBrowser] No documents found. Message:', data.message);
          setDocuments([]);
          if (data.message) {
            console.log('Info:', data.message);
          }
        }
      } else {
        console.error('[DocumentBrowser] Error loading documents:', data.error || 'Unknown error', data);
        setDocuments([]);
      }
    } catch (error) {
      console.error('[DocumentBrowser] Error loading documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const previewDocument = async (document: DocumentInfo) => {
    setSelectedDoc(document);
    setPreviewLoading(true);
    setPreviewText('');
    
    try {
      const response = await fetch('/api/documents/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: document.fileId }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setPreviewText(data.preview || 'No preview available');
      } else {
        setPreviewText(data.error || 'Failed to load preview. The document may not be indexed in the vector database.');
      }
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewText('Error loading preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const docTitle = doc.title || doc.name || 'Untitled Document';
    return docTitle.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col h-[650px] lg:h-[700px]">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-800">Vector DB Browser</h2>
          <button
            type="button"
            onClick={() => {
              console.log('[DocumentBrowser] Refresh button clicked - calling loadDocuments');
              loadDocuments();
            }}
            className="px-4 py-2 text-sm font-medium text-black hover:bg-black hover:text-white rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </span>
          </button>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Document List */}
        <div className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl p-4 overflow-y-auto">
          <h3 className="font-semibold text-gray-800 mb-3">
            Documents ({filteredDocuments.length})
          </h3>
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
              <p className="text-sm text-gray-500 mt-2">Loading documents from Pinecone...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                {searchQuery ? 'No documents match your search' : 'No documents found in vector database'}
              </p>
              <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
                {searchQuery 
                  ? 'Try a different search term'
                  : 'The vector database appears to be empty. To add documents:\n1. Go to the "Vectorization Setup" tab\n2. Use the Google Drive sync feature to vectorize your documents\n3. Or use the command line: npm run vectorize'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.fileId}
                  onClick={() => previewDocument(doc)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDoc?.fileId === doc.fileId
                      ? 'bg-black border-black'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${selectedDoc?.fileId === doc.fileId ? 'text-white' : 'text-gray-800'}`} title={doc.title || doc.name || 'Untitled Document'}>
                    {doc.title || doc.name || 'Untitled Document'}
                  </p>
                  <p className={`text-xs mt-1 ${selectedDoc?.fileId === doc.fileId ? 'text-gray-300' : 'text-gray-500'}`}>
                    {doc.chunkCount ? `${doc.chunkCount} chunk${doc.chunkCount !== 1 ? 's' : ''}` : 'Document'} • {doc.mimeType?.includes('pdf') ? 'PDF' :
                     doc.mimeType?.includes('word') ? 'Word' :
                     doc.mimeType?.includes('text') ? 'Text' :
                     'Document'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 overflow-y-auto">
          {selectedDoc ? (
            <>
              <div className="mb-4 pb-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{selectedDoc.title || selectedDoc.name || 'Untitled Document'}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>File ID: {selectedDoc.fileId}</span>
                  {selectedDoc.modifiedTime && (
                    <span>Modified: {new Date(selectedDoc.modifiedTime).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              {previewLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading preview...</p>
                </div>
              ) : previewText ? (
                <div className="prose max-w-none">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                    <div className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                      {previewText}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">No preview available</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">Select a document to preview</p>
              <p className="text-sm mt-2">Browse indexed documents from your knowledge base</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





