import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb } from 'pdf-lib';

// Import the same analytics logic
let analyticsStore: any[] = [];

function getAnalyticsData(range: string) {
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

  const filtered = analyticsStore.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate >= startDate;
  });

  const totalDocuments = filtered.length;
  const accessibleDocuments = filtered.filter(item => item.isAccessible).length;
  const inaccessibleDocuments = totalDocuments - accessibleDocuments;
  const accessibilityPercentage = totalDocuments > 0 
    ? (accessibleDocuments / totalDocuments) * 100 
    : 0;

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

  const issueCounts = new Map<string, { count: number; severity: 'low' | 'medium' | 'high' }>();
  filtered.forEach(item => {
    if (item.issues) {
      item.issues.forEach((issue: string) => {
        if (!issueCounts.has(issue)) {
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

  return {
    totalDocuments,
    accessibleDocuments,
    inaccessibleDocuments,
    accessibilityPercentage,
    trends,
    byType,
    topIssues,
    remediationNeeds,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dateRange = '30d' } = body;

    // Get analytics data directly
    const data = getAnalyticsData(dateRange);

    // Create PDF report
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    let yPosition = height - 50;

    // Title
    page.drawText('Accessibility Compliance Report', {
      x: 50,
      y: yPosition,
      size: 20,
      color: rgb(0, 0, 0),
    });
    yPosition -= 30;

    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: yPosition,
      size: 10,
      color: rgb(0.5, 0.5, 0.5),
    });
    yPosition -= 40;

    // Key Metrics
    page.drawText('Key Metrics', {
      x: 50,
      y: yPosition,
      size: 16,
      color: rgb(0, 0, 0),
    });
    yPosition -= 25;

    page.drawText(`Total Documents: ${data.totalDocuments}`, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    page.drawText(`Accessible: ${data.accessibleDocuments} (${data.accessibilityPercentage.toFixed(1)}%)`, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0.5, 0),
    });
    yPosition -= 20;

    page.drawText(`Inaccessible: ${data.inaccessibleDocuments} (${(100 - data.accessibilityPercentage).toFixed(1)}%)`, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0.8, 0, 0),
    });
    yPosition -= 30;

    // By Type
    page.drawText('By Document Type', {
      x: 50,
      y: yPosition,
      size: 16,
      color: rgb(0, 0, 0),
    });
    yPosition -= 25;

    page.drawText(`PDFs: ${data.byType.pdfs.accessible}/${data.byType.pdfs.total} (${data.byType.pdfs.percentage.toFixed(1)}%)`, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0),
    });
    yPosition -= 20;

    page.drawText(`Web Pages: ${data.byType.webpages.accessible}/${data.byType.webpages.total} (${data.byType.webpages.percentage.toFixed(1)}%)`, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0),
    });
    yPosition -= 30;

    // Top Issues
    if (data.topIssues.length > 0) {
      page.drawText('Top Accessibility Issues', {
        x: 50,
        y: yPosition,
        size: 16,
        color: rgb(0, 0, 0),
      });
      yPosition -= 25;

      data.topIssues.slice(0, 10).forEach((issue: any, index: number) => {
        if (yPosition < 50) {
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = height - 50;
        }
        page.drawText(`${index + 1}. ${issue.issue} (${issue.count} occurrences)`, {
          x: 50,
          y: yPosition,
          size: 10,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
      });
      yPosition -= 20;
    }

    // Remediation Needs
    if (data.remediationNeeds.length > 0) {
      page.drawText('Remediation Priorities', {
        x: 50,
        y: yPosition,
        size: 16,
        color: rgb(0, 0, 0),
      });
      yPosition -= 25;

      data.remediationNeeds.forEach((need: any) => {
        if (yPosition < 50) {
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = height - 50;
        }
        page.drawText(`${need.category}: ${need.count} items (${need.priority} priority)`, {
          x: 50,
          y: yPosition,
          size: 10,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="accessibility-report-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate report',
      },
      { status: 500 }
    );
  }
}
