'use client';

import { useState, useRef } from 'react';

interface PDFLink {
  url: string;
  name: string;
  status: 'pending' | 'analyzing' | 'analyzed' | 'processing' | 'processed' | 'error';
  analysis?: {
    risks: string[];
    summary: string;
    riskLevel: 'low' | 'medium' | 'high';
    wcagConformance?: {
      level: 'A' | 'AA' | 'AAA' | 'Non-conformant';
      passedCriteria: string[];
      failedCriteria: Array<{
        criterion: string;
        name: string;
        level: 'A' | 'AA' | 'AAA';
        description: string;
        impact: string;
      }>;
      warnings: string[];
    };
  };
  processedPDF?: {
    data: string;
    filename: string;
  };
  error?: string;
}

export default function PDFLinkProcessor({ onBack }: { onBack?: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [pdfUrlsText, setPdfUrlsText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfLinks, setPdfLinks] = useState<PDFLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  const MAX_PDFS = 100;

  const handleLoadUrls = () => {
    if (!pdfUrlsText.trim()) {
      setError('Please enter PDF URLs');
      return;
    }

    // Parse URLs from textarea - split by newline and filter empty lines
    const urlLines = pdfUrlsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (urlLines.length === 0) {
      setError('No URLs found. Please enter at least one PDF URL.');
      return;
    }

    if (urlLines.length > MAX_PDFS) {
      setError(`Too many URLs. Maximum ${MAX_PDFS} PDFs allowed.`);
      return;
    }

    // Check if any URLs are relative (don't start with http:// or https://)
    const hasRelativeUrls = urlLines.some(
      line => !line.startsWith('http://') && !line.startsWith('https://')
    );

    // Base URL is required only if there are relative URLs
    if (hasRelativeUrls && !baseUrl.trim()) {
      setError('Please enter a base URL (e.g., https://example.com) for relative URLs');
      return;
    }

    // Ensure base URL doesn't end with a slash
    const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '');

    // Convert relative URLs to absolute URLs
    const links: PDFLink[] = urlLines.map((urlLine) => {
      // If the URL already starts with http:// or https://, use it as-is
      if (urlLine.startsWith('http://') || urlLine.startsWith('https://')) {
        return {
          url: urlLine,
          name: urlLine.split('/').pop() || 'document.pdf',
          status: 'pending' as const,
        };
      }

      // Otherwise, prepend base URL
      // Ensure the relative URL starts with a slash
      const relativePath = urlLine.startsWith('/') ? urlLine : `/${urlLine}`;
      const absoluteUrl = `${cleanBaseUrl}${relativePath}`;

      return {
        url: absoluteUrl,
        name: urlLine.split('/').pop() || 'document.pdf',
        status: 'pending' as const,
      };
    });

    setPdfLinks(links);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (pdfLinks.length === 0) {
      setError('Please load PDF URLs first');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const urls = pdfLinks.map(p => p.url);

      const response = await fetch('/api/pdf-links/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to analyze PDFs' }));
        throw new Error(errorData.error || 'Failed to analyze PDFs');
      }

      const data = await response.json();

      if (data.success && data.results) {
        setPdfLinks(
          pdfLinks.map((link) => {
            const result = data.results.find((r: any) => r.url === link.url);
            if (result) {
              return {
                ...link,
                status: 'analyzed' as const,
                analysis: {
                  risks: result.risks || [],
                  summary: result.summary || 'No issues found',
                  riskLevel: result.riskLevel || 'low',
                  wcagConformance: result.wcagConformance,
                },
              };
            }
            return link;
          })
        );
      } else {
        throw new Error(data.error || 'Failed to analyze PDFs');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze PDFs');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleProcess = async () => {
    if (pdfLinks.length === 0) {
      setError('Please load and analyze PDFs first');
      return;
    }

    const unanalyzed = pdfLinks.filter(p => !p.analysis);
    if (unanalyzed.length > 0) {
      setError('Please analyze all PDFs before processing');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const urlsToProcess = pdfLinks.map(p => ({
        url: p.url,
        analysis: p.analysis,
      }));

      const response = await fetch('/api/pdf-links/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: urlsToProcess,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to process PDFs' }));
        throw new Error(errorData.error || 'Failed to process PDFs');
      }

      const data = await response.json();

      if (data.success && data.processedPDFs) {
        setPdfLinks(
          pdfLinks.map((link) => {
            const processed = data.processedPDFs.find((p: any) => p.url === link.url);
            if (processed) {
              return {
                ...link,
                status: 'processed' as const,
                processedPDF: {
                  data: processed.data,
                  filename: processed.filename,
                },
              };
            }
            return link;
          })
        );
      } else {
        throw new Error(data.error || 'Failed to process PDFs');
      }
    } catch (error) {
      console.error('Processing error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process PDFs');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPDF = (link: PDFLink) => {
    if (!link.processedPDF) return;

    const byteCharacters = atob(link.processedPDF.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ada-compliant-${link.processedPDF.filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    pdfLinks.forEach((link) => {
      if (link.processedPDF) {
        downloadPDF(link);
        // Small delay between downloads
        setTimeout(() => {}, 500);
      }
    });
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              PDF Link Processor
            </h2>
          </div>
        </div>
        <p className="text-gray-600 text-lg leading-relaxed">
          Paste PDF URLs (one per line) to analyze them for ADA and WCAG compliance risks, and generate compliant PDFs.
          Maximum {MAX_PDFS} PDFs per session.
        </p>
      </div>

      {/* Base URL Input */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Base URL <span className="text-gray-500 font-normal">(e.g., https://example.com)</span>
          <span className="text-red-500 ml-1">*</span>
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://example.com"
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all bg-white"
        />
        <p className="text-xs text-gray-500 mt-2">
          <span className="font-semibold">Required</span> if you have relative URLs (starting with /). 
          Relative URLs will be combined with this base URL. Absolute URLs (starting with http:// or https://) will be used as-is.
        </p>
      </div>

      {/* PDF URLs Textarea */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          PDF URLs <span className="text-gray-500 font-normal">(one per line)</span>
        </label>
        <textarea
          value={pdfUrlsText}
          onChange={(e) => setPdfUrlsText(e.target.value)}
          placeholder="/services/disability/pdf/disability verification form.pdf&#10;/services/disability/pdf/livescribe echo smartpen student manual.pdf&#10;/services/disability/pdf/scholarship opportunities for students with disabilities.pdf"
          rows={15}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all bg-white font-mono text-sm"
        />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-500">
            {pdfUrlsText.split('\n').filter(line => line.trim().length > 0).length} URL{pdfUrlsText.split('\n').filter(line => line.trim().length > 0).length !== 1 ? 's' : ''} entered
          </p>
          <button
            type="button"
            onClick={handleLoadUrls}
            disabled={!pdfUrlsText.trim()}
            className="px-6 py-2 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Load URLs</span>
          </button>
        </div>
      </div>

      {/* Actions */}
      {pdfLinks.length > 0 && (
        <div className="flex items-center justify-between bg-white border-2 border-gray-200 rounded-xl p-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">
              {pdfLinks.length} PDF{pdfLinks.length !== 1 ? 's' : ''} loaded
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {pdfLinks.filter(p => p.status === 'analyzed').length} analyzed
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || pdfLinks.length === 0}
              className="px-6 py-2 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze for Compliance'}
            </button>
            {pdfLinks.every(p => p.analysis) && (
              <button
                type="button"
                onClick={handleProcess}
                disabled={isProcessing || pdfLinks.some(p => !p.analysis)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Processing...' : 'Process & Generate Compliant PDFs'}
              </button>
            )}
            {pdfLinks.some(p => p.processedPDF) && (
              <button
                type="button"
                onClick={downloadAll}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Download All
              </button>
            )}
          </div>
        </div>
      )}

      {/* PDF List */}
      {pdfLinks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-gray-800">PDF Links</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {pdfLinks.map((link, index) => (
              <div
                key={index}
                className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <svg
                        className="w-6 h-6 text-red-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 break-all"
                      >
                        {link.name}
                      </a>
                      <span className={`text-xs px-2 py-1 rounded ${
                        link.status === 'processed' ? 'bg-green-100 text-green-800' :
                        link.status === 'analyzed' ? 'bg-blue-100 text-blue-800' :
                        link.status === 'analyzing' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {link.status.toUpperCase()}
                      </span>
                    </div>

                    {link.analysis && (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskColor(
                              link.analysis.riskLevel
                            )}`}
                          >
                            {link.analysis.riskLevel.toUpperCase()} RISK
                          </span>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <p className="text-sm font-semibold text-gray-700 mb-2">Summary:</p>
                          <p className="text-sm text-gray-600">{link.analysis.summary}</p>
                        </div>
                        {link.analysis.risks.length > 0 && (
                          <div>
                            <p className="text-sm font-semibold text-gray-700 mb-2">
                              Identified Risks:
                            </p>
                            <ul className="list-disc list-inside space-y-1">
                              {link.analysis.risks.map((risk, riskIndex) => (
                                <li key={riskIndex} className="text-sm text-gray-600">
                                  {risk}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {link.analysis.wcagConformance && (
                          <div className="mt-4 border-t border-gray-200 pt-4">
                            <p className="text-sm font-semibold text-gray-700 mb-3">
                              WCAG 2.1 Conformance Report
                            </p>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold text-gray-600">Conformance Level:</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  link.analysis.wcagConformance.level === 'AAA' 
                                    ? 'bg-green-100 text-green-800'
                                    : link.analysis.wcagConformance.level === 'AA'
                                    ? 'bg-blue-100 text-blue-800'
                                    : link.analysis.wcagConformance.level === 'A'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {link.analysis.wcagConformance.level}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="font-semibold text-gray-600">Passed Criteria:</span>
                                  <span className="ml-2 text-green-600">{link.analysis.wcagConformance.passedCriteria.length}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-gray-600">Failed Criteria:</span>
                                  <span className="ml-2 text-red-600">{link.analysis.wcagConformance.failedCriteria.length}</span>
                                </div>
                              </div>
                            </div>
                            {link.analysis.wcagConformance.failedCriteria.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-gray-700 mb-2">Failed WCAG 2.1 Criteria:</p>
                                <div className="space-y-2">
                                  {link.analysis.wcagConformance.failedCriteria.map((criterion, criterionIndex) => (
                                    <div key={criterionIndex} className="bg-red-50 border border-red-200 rounded p-3">
                                      <div className="flex items-start justify-between mb-1">
                                        <span className="text-xs font-bold text-red-800">{criterion.criterion}</span>
                                        <span className="text-xs px-2 py-0.5 bg-red-200 text-red-800 rounded">
                                          {criterion.level}
                                        </span>
                                      </div>
                                      <p className="text-xs font-semibold text-gray-700 mb-1">{criterion.name}</p>
                                      <p className="text-xs text-gray-600 mb-1">{criterion.description}</p>
                                      <p className="text-xs text-gray-500 italic">Impact: {criterion.impact}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {link.processedPDF && (
                      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-semibold text-green-800 mb-2">
                          ✓ Compliant PDF generated
                        </p>
                        <button
                          type="button"
                          onClick={() => downloadPDF(link)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                        >
                          Download Compliant PDF
                        </button>
                      </div>
                    )}

                    {link.error && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">{link.error}</p>
                      </div>
                    )}
                  </div>
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
