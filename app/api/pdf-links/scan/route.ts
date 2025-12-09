import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const maxDuration = 300; // 5 minutes

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ADA Compliance PDF Link Scanner)',
      },
      maxRedirects: 5,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

function extractPDFLinks(html: string, baseUrl: string, maxPdfs: number): string[] {
  const pdfLinks: string[] = [];
  const baseUrlObj = new URL(baseUrl);
  const baseDomain = baseUrlObj.hostname;

  // Extract all links
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null && pdfLinks.length < maxPdfs) {
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
        // Check if it's a PDF
        if (linkUrl.pathname.toLowerCase().endsWith('.pdf') || 
            link.toLowerCase().includes('.pdf') ||
            linkUrl.searchParams.toString().includes('.pdf')) {
          // Normalize URL
          linkUrl.hash = '';
          const normalizedUrl = linkUrl.href.replace(/\/$/, '');
          
          if (!pdfLinks.includes(normalizedUrl)) {
            pdfLinks.push(normalizedUrl);
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  return pdfLinks;
}

async function crawlForPDFs(
  startUrl: string,
  maxPdfs: number
): Promise<Array<{ url: string; name: string }>> {
  const visited = new Set<string>();
  const pdfLinks: Array<{ url: string; name: string }> = [];
  const queue: string[] = [startUrl];
  const maxDepth = 3; // Limit crawling depth
  let currentDepth = 0;
  const depthMap = new Map<string, number>();
  depthMap.set(startUrl, 0);

  while (queue.length > 0 && pdfLinks.length < maxPdfs) {
    const url = queue.shift()!;
    const depth = depthMap.get(url) || 0;

    if (visited.has(url) || depth > maxDepth) {
      continue;
    }

    visited.add(url);

    const html = await fetchPage(url);
    if (html) {
      const foundPDFs = extractPDFLinks(html, url, maxPdfs - pdfLinks.length);
      
      for (const pdfUrl of foundPDFs) {
        if (!pdfLinks.find(p => p.url === pdfUrl)) {
          const urlObj = new URL(pdfUrl);
          const name = urlObj.pathname.split('/').pop() || 'document.pdf';
          pdfLinks.push({
            url: pdfUrl,
            name: name.endsWith('.pdf') ? name : `${name}.pdf`,
          });
        }
      }

      // Continue crawling if we haven't reached max PDFs
      if (pdfLinks.length < maxPdfs && depth < maxDepth) {
        // Extract regular page links for further crawling
        const pageLinks = extractPDFLinks(html, url, 50).filter(link => !link.endsWith('.pdf'));
        for (const pageLink of pageLinks) {
          if (!visited.has(pageLink) && !depthMap.has(pageLink)) {
            queue.push(pageLink);
            depthMap.set(pageLink, depth + 1);
          }
        }
      }
    }
  }

  return pdfLinks;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, maxPdfs = 100 } = body;

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

    if (maxPdfs > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 PDFs allowed' },
        { status: 400 }
      );
    }

    const pdfs = await crawlForPDFs(validatedUrl, maxPdfs);

    return NextResponse.json({
      success: true,
      pdfs,
      count: pdfs.length,
    });
  } catch (error) {
    console.error('PDF link scan error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan for PDFs',
      },
      { status: 500 }
    );
  }
}
