'use client';

import { useState } from 'react';

interface TriageItem {
  url: string;
  type: 'page' | 'pdf';
  depth: number;
  viewCount?: number;
  accessibilityScore?: number;
  recommendations: {
    archive: boolean;
    convertToHTML: boolean;
    remediationPriority: 'high' | 'medium' | 'low' | 'none';
    reason: string;
  };
}

export default function Triage({ onBack }: { onBack?: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [triageResults, setTriageResults] = useState<TriageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'archive' | 'convert' | 'remediate'>('all');

  const MAX_DEPTH = 7;

  const handleScan = async () => {
    if (!baseUrl.trim()) {
      setError('Please enter a website URL');
      return;
    }

    const urlToScan = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    
    try {
      new URL(urlToScan);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setIsScanning(true);
    setError(null);
    setTriageResults([]);

    try {
      const response = await fetch('/api/triage/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: urlToScan,
          maxDepth: MAX_DEPTH,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to scan website' }));
        throw new Error(errorData.error || 'Failed to scan website');
      }

      const data = await response.json();

      if (data.success && data.results) {
        setTriageResults(data.results);
      } else {
        throw new Error(data.error || 'Failed to scan website');
      }
    } catch (error) {
      console.error('Triage scan error:', error);
      setError(error instanceof Error ? error.message : 'Failed to scan website');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredResults = triageResults.filter(item => {
    if (viewMode === 'archive') return item.recommendations.archive;
    if (viewMode === 'convert') return item.recommendations.convertToHTML;
    if (viewMode === 'remediate') return item.recommendations.remediationPriority !== 'none';
    return true;
  });

  const archiveCount = triageResults.filter(r => r.recommendations.archive).length;
  const convertCount = triageResults.filter(r => r.recommendations.convertToHTML).length;
  const highPriorityCount = triageResults.filter(r => r.recommendations.remediationPriority === 'high').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Back to main"
              >
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            <div className="w-12 h-12 bg-gradient-to-br from-black to-black rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Triage Scanner
            </h2>
          </div>
        </div>
        <p className="text-gray-600 text-lg leading-relaxed">
          Identify most viewed pages and PDFs across {MAX_DEPTH} layers. Determine what to archive, convert to HTML, or prioritize for remediation.
        </p>
      </div>

      {/* URL Input */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Website URL
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="example.com or https://example.com"
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all bg-white"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !isScanning) {
                handleScan();
              }
            }}
          />
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning || !baseUrl.trim()}
            className="px-8 py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isScanning ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Scan & Analyze</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {triageResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-600 mb-1">Total Items</p>
            <p className="text-2xl font-bold text-gray-800">{triageResults.length}</p>
          </div>
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-yellow-700 mb-1">Archive</p>
            <p className="text-2xl font-bold text-yellow-800">{archiveCount}</p>
          </div>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-blue-700 mb-1">Convert to HTML</p>
            <p className="text-2xl font-bold text-blue-800">{convertCount}</p>
          </div>
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-red-700 mb-1">High Priority</p>
            <p className="text-2xl font-bold text-red-800">{highPriorityCount}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      {triageResults.length > 0 && (
        <div className="flex gap-2 bg-white rounded-xl p-2 border-2 border-gray-200">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              viewMode === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All ({triageResults.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('archive')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              viewMode === 'archive' ? 'bg-yellow-500 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Archive ({archiveCount})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('convert')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              viewMode === 'convert' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Convert ({convertCount})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('remediate')}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors ${
              viewMode === 'remediate' ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Remediate ({highPriorityCount})
          </button>
        </div>
      )}

      {/* Results */}
      {filteredResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-800">
            {viewMode === 'archive' ? 'Items to Archive' :
             viewMode === 'convert' ? 'Items to Convert to HTML' :
             viewMode === 'remediate' ? 'High Priority Remediation' :
             'All Scanned Items'}
          </h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {filteredResults.map((item, index) => (
              <div
                key={index}
                className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {item.type === 'pdf' ? (
                        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 break-all"
                      >
                        {item.url}
                      </a>
                      <span className="text-xs text-gray-500">(Depth: {item.depth})</span>
                    </div>
                    {item.viewCount !== undefined && (
                      <p className="text-xs text-gray-600 mb-2">
                        View Count: <span className="font-semibold">{item.viewCount.toLocaleString()}</span>
                      </p>
                    )}
                    {item.accessibilityScore !== undefined && (
                      <p className="text-xs text-gray-600 mb-2">
                        Accessibility Score: <span className="font-semibold">{item.accessibilityScore}%</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Recommendations */}
                <div className="space-y-2">
                  {item.recommendations.archive && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-semibold text-yellow-800">Archive Recommended</span>
                      </div>
                      <p className="text-xs text-yellow-700">{item.recommendations.reason}</p>
                    </div>
                  )}
                  {item.recommendations.convertToHTML && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                        </svg>
                        <span className="text-sm font-semibold text-blue-800">Convert to HTML</span>
                      </div>
                      <p className="text-xs text-blue-700">{item.recommendations.reason}</p>
                    </div>
                  )}
                  {item.recommendations.remediationPriority !== 'none' && (
                    <div className={`border rounded-lg p-3 ${
                      item.recommendations.remediationPriority === 'high' ? 'bg-red-50 border-red-200' :
                      item.recommendations.remediationPriority === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-sm font-semibold ${
                          item.recommendations.remediationPriority === 'high' ? 'text-red-800' :
                          item.recommendations.remediationPriority === 'medium' ? 'text-yellow-800' :
                          'text-blue-800'
                        }`}>
                          {item.recommendations.remediationPriority.toUpperCase()} Priority Remediation
                        </span>
                      </div>
                      <p className={`text-xs ${
                        item.recommendations.remediationPriority === 'high' ? 'text-red-700' :
                        item.recommendations.remediationPriority === 'medium' ? 'text-yellow-700' :
                        'text-blue-700'
                      }`}>
                        {item.recommendations.reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
