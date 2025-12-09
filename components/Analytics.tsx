'use client';

import { useState, useEffect } from 'react';

interface AnalyticsData {
  totalDocuments: number;
  accessibleDocuments: number;
  inaccessibleDocuments: number;
  accessibilityPercentage: number;
  trends: Array<{
    date: string;
    accessible: number;
    inaccessible: number;
    percentage: number;
  }>;
  byType: {
    pdfs: { total: number; accessible: number; percentage: number };
    webpages: { total: number; accessible: number; percentage: number };
  };
  topIssues: Array<{
    issue: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  remediationNeeds: Array<{
    category: string;
    count: number;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export default function Analytics({ onBack }: { onBack?: () => void }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/analytics?range=${dateRange}`);
      const data = await response.json();
      
      if (response.ok && data.success) {
        setAnalytics(data.data);
      } else {
        throw new Error(data.error || 'Failed to load analytics');
      }
    } catch (error) {
      console.error('Analytics error:', error);
      setError(error instanceof Error ? error.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      const response = await fetch('/api/analytics/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dateRange }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      const blob = await response.blob();
      if (blob.type === 'application/pdf') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accessibility-report-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // If it's JSON (error), parse it
        const text = await blob.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Report generation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate report');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          <p className="text-sm text-gray-500 mt-2">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const data = analytics || {
    totalDocuments: 0,
    accessibleDocuments: 0,
    inaccessibleDocuments: 0,
    accessibilityPercentage: 0,
    trends: [],
    byType: { pdfs: { total: 0, accessible: 0, percentage: 0 }, webpages: { total: 0, accessible: 0, percentage: 0 } },
    topIssues: [],
    remediationNeeds: [],
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Accessibility Analytics
            </h2>
          </div>
          <div className="flex gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <button
              type="button"
              onClick={generateReport}
              className="px-6 py-2 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors"
            >
              Generate Report
            </button>
          </div>
        </div>
        <p className="text-gray-600 text-lg leading-relaxed">
          Track accessibility metrics, identify trends, and demonstrate ongoing compliance efforts.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-gray-600 mb-2">Total Documents</p>
          <p className="text-3xl font-bold text-gray-800">{data.totalDocuments}</p>
        </div>
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-green-700 mb-2">Accessible</p>
          <p className="text-3xl font-bold text-green-800">{data.accessibleDocuments}</p>
          <p className="text-xs text-green-600 mt-1">{data.accessibilityPercentage.toFixed(1)}%</p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-red-700 mb-2">Inaccessible</p>
          <p className="text-3xl font-bold text-red-800">{data.inaccessibleDocuments}</p>
          <p className="text-xs text-red-600 mt-1">{(100 - data.accessibilityPercentage).toFixed(1)}%</p>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-blue-700 mb-2">Accessibility Rate</p>
          <p className="text-3xl font-bold text-blue-800">{data.accessibilityPercentage.toFixed(1)}%</p>
        </div>
      </div>

      {/* Trends Chart */}
      {data.trends.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Trends Over Time</h3>
          <div className="space-y-2">
            {data.trends.map((trend, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-24 text-xs text-gray-600">{new Date(trend.date).toLocaleDateString()}</div>
                <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                  <div
                    className="bg-green-500 h-6 rounded-full flex items-center justify-center text-xs text-white font-semibold"
                    style={{ width: `${trend.percentage}%` }}
                  >
                    {trend.percentage > 10 ? `${trend.percentage.toFixed(0)}%` : ''}
                  </div>
                </div>
                <div className="w-20 text-xs text-gray-600 text-right">
                  {trend.accessible}/{trend.accessible + trend.inaccessible}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4">PDF Documents</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total PDFs</span>
              <span className="text-lg font-bold text-gray-800">{data.byType.pdfs.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Accessible</span>
              <span className="text-lg font-bold text-green-600">{data.byType.pdfs.accessible}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-green-500 h-4 rounded-full"
                style={{ width: `${data.byType.pdfs.percentage}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500">{data.byType.pdfs.percentage.toFixed(1)}% accessible</p>
          </div>
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Web Pages</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Pages</span>
              <span className="text-lg font-bold text-gray-800">{data.byType.webpages.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Accessible</span>
              <span className="text-lg font-bold text-green-600">{data.byType.webpages.accessible}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-green-500 h-4 rounded-full"
                style={{ width: `${data.byType.webpages.percentage}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500">{data.byType.webpages.percentage.toFixed(1)}% accessible</p>
          </div>
        </div>
      </div>

      {/* Top Issues */}
      {data.topIssues.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Top Accessibility Issues</h3>
          <div className="space-y-3">
            {data.topIssues.map((issue, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-600">#{index + 1}</span>
                  <span className="text-sm text-gray-800">{issue.issue}</span>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    issue.severity === 'high' ? 'bg-red-100 text-red-800' :
                    issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {issue.severity}
                  </span>
                </div>
                <span className="text-sm font-bold text-gray-800">{issue.count} occurrences</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remediation Needs */}
      {data.remediationNeeds.length > 0 && (
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Remediation Priorities</h3>
          <div className="space-y-3">
            {data.remediationNeeds.map((need, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-l-4 border-black">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{need.category}</p>
                  <p className="text-xs text-gray-600 mt-1">{need.count} items need attention</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  need.priority === 'high' ? 'bg-red-100 text-red-800' :
                  need.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {need.priority.toUpperCase()} PRIORITY
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}
