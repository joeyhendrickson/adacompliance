'use client';

import { useState, useCallback, useRef } from 'react';

interface PDFFile {
  id: string;
  file: File;
  name: string;
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
  processed?: boolean;
  processedBlob?: Blob;
}

interface PDFProcessorProps {
  onBack?: () => void;
}

export default function PDFProcessor({ onBack }: PDFProcessorProps) {
  const [pdfs, setPdfs] = useState<PDFFile[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const MAX_PDFS = 10;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    const pdfFiles = Array.from(files).filter(
      (file) => file.type === 'application/pdf'
    );

    if (pdfFiles.length === 0) {
      setError('Please select PDF files only');
      return;
    }

    const currentCount = pdfs.length;
    const remainingSlots = MAX_PDFS - currentCount;

    if (pdfFiles.length > remainingSlots) {
      setError(`Maximum ${MAX_PDFS} PDFs allowed. You can add ${remainingSlots} more.`);
      return;
    }

    const newPdfs: PDFFile[] = pdfFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
    }));

    setPdfs([...pdfs, ...newPdfs]);
    setError(null);
  }, [pdfs]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removePDF = (id: string) => {
    setPdfs(pdfs.filter((pdf) => pdf.id !== id));
  };

  const handleAnalyze = async () => {
    if (pdfs.length === 0) {
      setError('Please upload at least one PDF file');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      pdfs.forEach((pdf) => {
        formData.append('pdfs', pdf.file);
      });

      const response = await fetch('/api/pdf/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to analyze PDFs' }));
        throw new Error(errorData.error || 'Failed to analyze PDFs');
      }

      const data = await response.json();

      if (data.success && data.results) {
        setPdfs(
          pdfs.map((pdf) => {
            const result = data.results.find((r: any) => r.filename === pdf.name);
            return result
              ? {
                  ...pdf,
                  analysis: {
                    risks: result.risks || [],
                    summary: result.summary || 'No issues found',
                    riskLevel: result.riskLevel || 'low',
                  },
                }
              : pdf;
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
    if (pdfs.length === 0) {
      setError('Please upload and analyze PDFs first');
      return;
    }

    const unanalyzed = pdfs.filter((pdf) => !pdf.analysis);
    if (unanalyzed.length > 0) {
      setError('Please analyze all PDFs before processing');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      pdfs.forEach((pdf) => {
        formData.append('pdfs', pdf.file);
        if (pdf.analysis) {
          formData.append('analyses', JSON.stringify(pdf.analysis));
        }
      });

      const response = await fetch('/api/pdf/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to process PDFs' }));
        throw new Error(errorData.error || 'Failed to process PDFs');
      }

      const data = await response.json();

      if (data.success && data.processedPDFs) {
        setPdfs(
          pdfs.map((pdf) => {
            const processed = data.processedPDFs.find((p: any) => p.filename === pdf.name);
            if (processed) {
              const byteCharacters = atob(processed.data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'application/pdf' });

              return {
                ...pdf,
                processed: true,
                processedBlob: blob,
              };
            }
            return pdf;
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

  const downloadPDF = (pdf: PDFFile) => {
    if (!pdf.processedBlob) return;

    const url = URL.createObjectURL(pdf.processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ada-compliant-${pdf.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    pdfs.forEach((pdf) => {
      if (pdf.processedBlob) {
        downloadPDF(pdf);
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              PDF ADA Compliance Processor
            </h2>
          </div>
        </div>
        <p className="text-gray-600 text-lg leading-relaxed">
          Upload PDF documents to analyze for ADA compliance issues and automatically correct them.
          Maximum {MAX_PDFS} PDFs per session.
        </p>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 transition-colors ${
          dragActive
            ? 'border-black bg-gray-50'
            : 'border-gray-300 bg-white'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-lg font-semibold text-gray-700 mb-2">
            Drop PDF files here or click to browse
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Upload up to {MAX_PDFS} PDF files ({pdfs.length}/{MAX_PDFS} uploaded)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            disabled={pdfs.length >= MAX_PDFS}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pdfs.length >= MAX_PDFS}
            className="px-6 py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Select PDF Files
          </button>
        </div>
      </div>

      {/* PDF List */}
      {pdfs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-800">
              Uploaded PDFs ({pdfs.length})
            </h3>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing || pdfs.length === 0}
                className="px-6 py-2 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze for Compliance'}
              </button>
              {pdfs.every((pdf) => pdf.analysis) && (
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isProcessing || pdfs.some((pdf) => !pdf.analysis)}
                  className="px-6 py-2 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? 'Processing...' : 'Process & Correct PDFs'}
                </button>
              )}
              {pdfs.some((pdf) => pdf.processed) && (
                <button
                  type="button"
                  onClick={downloadAll}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  Download All
                </button>
              )}
            </div>
          </div>

          {pdfs.map((pdf) => (
            <div
              key={pdf.id}
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
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h4 className="text-lg font-semibold text-gray-800">{pdf.name}</h4>
                  </div>

                  {pdf.analysis && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${getRiskColor(
                            pdf.analysis.riskLevel
                          )}`}
                        >
                          {pdf.analysis.riskLevel.toUpperCase()} RISK
                        </span>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Summary:</p>
                        <p className="text-sm text-gray-600">{pdf.analysis.summary}</p>
                      </div>
                      {pdf.analysis.risks.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-2">
                            Identified Risks:
                          </p>
                          <ul className="list-disc list-inside space-y-1">
                            {pdf.analysis.risks.map((risk, index) => (
                              <li key={index} className="text-sm text-gray-600">
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {pdf.analysis.wcagConformance && (
                        <div className="mt-4 border-t border-gray-200 pt-4">
                          <p className="text-sm font-semibold text-gray-700 mb-3">
                            WCAG 2.1 Conformance Report
                          </p>
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-gray-600">Conformance Level:</span>
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                pdf.analysis.wcagConformance.level === 'AAA' 
                                  ? 'bg-green-100 text-green-800'
                                  : pdf.analysis.wcagConformance.level === 'AA'
                                  ? 'bg-blue-100 text-blue-800'
                                  : pdf.analysis.wcagConformance.level === 'A'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {pdf.analysis.wcagConformance.level}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="font-semibold text-gray-600">Passed Criteria:</span>
                                <span className="ml-2 text-green-600">{pdf.analysis.wcagConformance.passedCriteria.length}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">Failed Criteria:</span>
                                <span className="ml-2 text-red-600">{pdf.analysis.wcagConformance.failedCriteria.length}</span>
                              </div>
                            </div>
                          </div>
                          {pdf.analysis.wcagConformance.failedCriteria.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-700 mb-2">Failed WCAG 2.1 Criteria:</p>
                              <div className="space-y-2">
                                {pdf.analysis.wcagConformance.failedCriteria.map((criterion, index) => (
                                  <div key={index} className="bg-red-50 border border-red-200 rounded p-3">
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
                          {pdf.analysis.wcagConformance.passedCriteria.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Passed Criteria:</p>
                              <div className="flex flex-wrap gap-1">
                                {pdf.analysis.wcagConformance.passedCriteria.map((criterion, index) => (
                                  <span key={index} className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                    {criterion}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {pdf.analysis.wcagConformance.warnings.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-yellow-700 mb-2">Warnings:</p>
                              <ul className="list-disc list-inside space-y-1">
                                {pdf.analysis.wcagConformance.warnings.map((warning, index) => (
                                  <li key={index} className="text-xs text-yellow-700">{warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {pdf.processed && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-semibold text-green-800 mb-2">
                        ✓ PDF has been processed and corrected
                      </p>
                      <button
                        type="button"
                        onClick={() => downloadPDF(pdf)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                      >
                        Download Corrected PDF
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removePDF(pdf.id)}
                  className="ml-4 text-red-500 hover:text-red-700 transition-colors"
                  aria-label="Remove PDF"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
