import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const maxDuration = 300; // 5 minutes (Vercel Hobby plan limit)

interface URLData {
  url: string;
  depth: number;
  type: 'page' | 'pdf';
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ADA Compliance Triage Scanner)',
      },
      maxRedirects: 5,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

function extractLinks(html: string, baseUrl: string): { pages: string[]; pdfs: string[] } {
  const pages: string[] = [];
  const pdfs: string[] = [];
  const baseUrlObj = new URL(baseUrl);
  const baseDomain = baseUrlObj.hostname;

  // Extract all links
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    let link = match[1];

    // Skip javascript:, mailto:, tel:, etc.
    if (link.startsWith('javascript:') || link.startsWith('mailto:') || link.startsWith('tel:') || link.startsWith('#')) {
      continue;
    }

    try {
      // Convert relative URLs to absolute
      if (link.startsWith('/')) {
        link = `${baseUrlObj.protocol}//${baseUrlObj.hostname}${link}`;
      } else if (!link.startsWith('http')) {
        link = new URL(link, baseUrl).href;
      }

      const linkUrl = new URL(link);

      // Only include links from the same domain
      if (linkUrl.hostname === baseDomain || linkUrl.hostname.endsWith(`.${baseDomain}`)) {
        // Normalize URL
        linkUrl.hash = '';
        const normalizedUrl = linkUrl.href.replace(/\/$/, '');
        
        // Check if it's a PDF
        if (normalizedUrl.toLowerCase().endsWith('.pdf') || linkUrl.pathname.toLowerCase().includes('.pdf')) {
          if (!pdfs.includes(normalizedUrl)) {
            pdfs.push(normalizedUrl);
          }
        } else {
          if (!pages.includes(normalizedUrl)) {
            pages.push(normalizedUrl);
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  return { pages, pdfs };
}

async function crawlWebsite(
  startUrl: string,
  maxDepth: number
): Promise<URLData[]> {
  const visited = new Set<string>();
  const urls: URLData[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  while (queue.length > 0) {
    const { url, depth } = queue.shift()!;

    // Normalize URL
    let normalizedUrl: string;
    try {
      const urlObj = new URL(url);
      urlObj.hash = '';
      normalizedUrl = urlObj.href.replace(/\/$/, '');
    } catch {
      continue;
    }

    if (visited.has(normalizedUrl) || depth > maxDepth) {
      continue;
    }

    visited.add(normalizedUrl);

    // Determine type
    const isPDF = normalizedUrl.toLowerCase().endsWith('.pdf') || 
                  normalizedUrl.toLowerCase().includes('.pdf');
    
    urls.push({
      url: normalizedUrl,
      depth,
      type: isPDF ? 'pdf' : 'page',
    });

    // Only crawl HTML pages (not PDFs) and only if within depth limit
    if (!isPDF && depth < maxDepth) {
      const html = await fetchPage(normalizedUrl);
      if (html) {
        const { pages, pdfs } = extractLinks(html, normalizedUrl);
        
        // Add PDFs
        for (const pdfUrl of pdfs) {
          if (!visited.has(pdfUrl)) {
            urls.push({
              url: pdfUrl,
              depth: depth + 1,
              type: 'pdf',
            });
            visited.add(pdfUrl);
          }
        }

        // Add pages to queue
        for (const pageUrl of pages) {
          if (!visited.has(pageUrl) && urls.length < 1000) { // Limit total URLs
            queue.push({ url: pageUrl, depth: depth + 1 });
          }
        }
      }
    }
  }

  return urls;
}

function analyzeTriageItem(
  item: URLData,
  allItems: URLData[]
): {
  archive: boolean;
  convertToHTML: boolean;
  remediationPriority: 'high' | 'medium' | 'low' | 'none';
  reason: string;
} {
  const recommendations: {
    archive: boolean;
    convertToHTML: boolean;
    remediationPriority: 'high' | 'medium' | 'low' | 'none';
    reason: string;
  } = {
    archive: false,
    convertToHTML: false,
    remediationPriority: 'none',
    reason: '',
  };

  // Simulate view count (in production, this would come from analytics)
  const viewCount = Math.floor(Math.random() * 10000);
  
  // Archive recommendations
  if (item.depth > 5 || viewCount < 10) {
    recommendations.archive = true;
    recommendations.reason = `Low view count (${viewCount}) and deep nesting (depth ${item.depth}). Consider archiving.`;
  }

  // Convert to HTML recommendations
  if (item.type === 'pdf' && viewCount > 100) {
    recommendations.convertToHTML = true;
    recommendations.reason = `High view count (${viewCount}). Consider converting to HTML for better accessibility.`;
  }

  // Remediation priority
  if (item.type === 'pdf' && viewCount > 500) {
    recommendations.remediationPriority = 'high';
    recommendations.reason = `High view count (${viewCount}). High priority for PDF remediation.`;
  } else if (item.type === 'pdf' && viewCount > 100) {
    recommendations.remediationPriority = 'medium';
    recommendations.reason = `Moderate view count (${viewCount}). Medium priority for PDF remediation.`;
  } else if (item.type === 'pdf') {
    recommendations.remediationPriority = 'low';
    recommendations.reason = `Lower view count (${viewCount}). Lower priority for PDF remediation.`;
  } else if (viewCount > 1000) {
    recommendations.remediationPriority = 'high';
    recommendations.reason = `Very high view count (${viewCount}). High priority for page remediation.`;
  } else if (viewCount > 100) {
    recommendations.remediationPriority = 'medium';
    recommendations.reason = `Moderate view count (${viewCount}). Medium priority for page remediation.`;
  }

  return recommendations;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, maxDepth = 7 } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let validatedUrl: string;
    try {
      validatedUrl = url.startsWith('http') ? url : `https://${url}`;
      new URL(validatedUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    if (maxDepth > 7) {
      return NextResponse.json(
        { success: false, error: 'Maximum depth is 7 layers' },
        { status: 400 }
      );
    }

    // Crawl website
    const urls = await crawlWebsite(validatedUrl, maxDepth);

    // Analyze each item
    const results = urls.map(item => {
      const recommendations = analyzeTriageItem(item, urls);
      
      // Simulate view count and accessibility score
      const viewCount = Math.floor(Math.random() * 10000);
      const accessibilityScore = Math.floor(Math.random() * 100);

      return {
        url: item.url,
        type: item.type,
        depth: item.depth,
        viewCount,
        accessibilityScore,
        recommendations,
      };
    });

    // Sort by view count (highest first)
    results.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Triage scan error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan website',
      },
      { status: 500 }
    );
  }
}
