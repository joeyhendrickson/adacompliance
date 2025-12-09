import { NextRequest, NextResponse } from 'next/server';

// In a real implementation, this would connect to a database
// For now, we'll use a simple in-memory store (would need database in production)
let analyticsStore: any[] = [];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get('range') || '30d';

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (range) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate = new Date(0);
        break;
    }

    // Filter analytics by date range
    const filtered = analyticsStore.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= startDate;
    });

    // Calculate metrics
    const totalDocuments = filtered.length;
    const accessibleDocuments = filtered.filter(item => item.isAccessible).length;
    const inaccessibleDocuments = totalDocuments - accessibleDocuments;
    const accessibilityPercentage = totalDocuments > 0 
      ? (accessibleDocuments / totalDocuments) * 100 
      : 0;

    // Group by type
    const pdfs = filtered.filter(item => item.type === 'pdf');
    const webpages = filtered.filter(item => item.type === 'webpage');
    
    const byType = {
      pdfs: {
        total: pdfs.length,
        accessible: pdfs.filter(p => p.isAccessible).length,
        percentage: pdfs.length > 0 
          ? (pdfs.filter(p => p.isAccessible).length / pdfs.length) * 100 
          : 0,
      },
      webpages: {
        total: webpages.length,
        accessible: webpages.filter(w => w.isAccessible).length,
        percentage: webpages.length > 0 
          ? (webpages.filter(w => w.isAccessible).length / webpages.length) * 100 
          : 0,
      },
    };

    // Calculate trends (daily)
    const trendsMap = new Map<string, { accessible: number; inaccessible: number }>();
    filtered.forEach(item => {
      const dateKey = new Date(item.date).toISOString().split('T')[0];
      if (!trendsMap.has(dateKey)) {
        trendsMap.set(dateKey, { accessible: 0, inaccessible: 0 });
      }
      const dayData = trendsMap.get(dateKey)!;
      if (item.isAccessible) {
        dayData.accessible++;
      } else {
        dayData.inaccessible++;
      }
    });

    const trends = Array.from(trendsMap.entries())
      .map(([date, data]) => ({
        date,
        accessible: data.accessible,
        inaccessible: data.inaccessible,
        percentage: (data.accessible + data.inaccessible) > 0
          ? (data.accessible / (data.accessible + data.inaccessible)) * 100
          : 0,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Top issues
    const issueCounts = new Map<string, { count: number; severity: 'low' | 'medium' | 'high' }>();
    filtered.forEach(item => {
      if (item.issues) {
        item.issues.forEach((issue: string) => {
          if (!issueCounts.has(issue)) {
            // Determine severity based on issue type
            let severity: 'low' | 'medium' | 'high' = 'medium';
            if (issue.toLowerCase().includes('missing') || issue.toLowerCase().includes('no')) {
              severity = 'high';
            } else if (issue.toLowerCase().includes('potential') || issue.toLowerCase().includes('may')) {
              severity = 'low';
            }
            issueCounts.set(issue, { count: 0, severity });
          }
          issueCounts.get(issue)!.count++;
        });
      }
    });

    const topIssues = Array.from(issueCounts.entries())
      .map(([issue, data]) => ({
        issue,
        count: data.count,
        severity: data.severity,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Remediation needs
    const remediationNeeds = [
      {
        category: 'Missing Alt Text',
        count: filtered.filter(item => item.issues?.some((i: string) => i.includes('alt text'))).length,
        priority: 'high' as const,
      },
      {
        category: 'Missing Headings',
        count: filtered.filter(item => item.issues?.some((i: string) => i.includes('heading'))).length,
        priority: 'medium' as const,
      },
      {
        category: 'Form Labels',
        count: filtered.filter(item => item.issues?.some((i: string) => i.includes('form') || i.includes('label'))).length,
        priority: 'high' as const,
      },
      {
        category: 'Color Contrast',
        count: filtered.filter(item => item.issues?.some((i: string) => i.includes('contrast') || i.includes('color'))).length,
        priority: 'medium' as const,
      },
    ].filter(item => item.count > 0);

    return NextResponse.json({
      success: true,
      data: {
        totalDocuments,
        accessibleDocuments,
        inaccessibleDocuments,
        accessibilityPercentage,
        trends,
        byType,
        topIssues,
        remediationNeeds,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load analytics',
      },
      { status: 500 }
    );
  }
}

// Endpoint to record analytics data (called after PDF/website analysis)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, isAccessible, issues, url, filename } = body;

    analyticsStore.push({
      date: new Date().toISOString(),
      type: type || 'unknown',
      isAccessible: isAccessible || false,
      issues: issues || [],
      url: url || filename || 'unknown',
    });

    return NextResponse.json({
      success: true,
      message: 'Analytics data recorded',
    });
  } catch (error) {
    console.error('Analytics POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record analytics',
      },
      { status: 500 }
    );
  }
}
