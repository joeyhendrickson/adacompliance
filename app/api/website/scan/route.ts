import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const maxDuration = 300; // 5 minutes

interface URLData {
  url: string;
  depth: number;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ADA Compliance Scanner)',
      },
      maxRedirects: 5,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

function extractLinks(html: string, baseUrl: string, currentDepth: number, maxDepth: number): string[] {
  const links: string[] = [];
  const baseUrlObj = new URL(baseUrl);
  const baseDomain = baseUrlObj.hostname;

  // Extract href attributes from anchor tags
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
        // Normalize URL (remove fragments, trailing slashes)
        linkUrl.hash = '';
        const normalizedUrl = linkUrl.href.replace(/\/$/, '');
        
        if (!links.includes(normalizedUrl)) {
          links.push(normalizedUrl);
        }
      }
    } catch (e) {
      // Invalid URL, skip
      continue;
    }
  }

  return links;
}

async function crawlWebsite(
  startUrl: string,
  maxUrls: number,
  maxDepth: number
): Promise<URLData[]> {
  const visited = new Set<string>();
  const urls: URLData[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

  while (queue.length > 0 && urls.length < maxUrls) {
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
    urls.push({ url: normalizedUrl, depth });

    if (depth < maxDepth && urls.length < maxUrls) {
      const html = await fetchPage(normalizedUrl);
      if (html) {
        const links = extractLinks(html, normalizedUrl, depth, maxDepth);
        for (const link of links) {
          if (!visited.has(link) && urls.length < maxUrls) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    }
  }

  return urls;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, maxUrls = 100, maxDepth = 3 } = body;

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

    if (maxUrls > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 URLs allowed' },
        { status: 400 }
      );
    }

    if (maxDepth > 3) {
      return NextResponse.json(
        { success: false, error: 'Maximum depth is 3 layers' },
        { status: 400 }
      );
    }

    const urls = await crawlWebsite(validatedUrl, maxUrls, maxDepth);

    return NextResponse.json({
      success: true,
      urls,
      count: urls.length,
    });
  } catch (error) {
    console.error('Website scan error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan website',
      },
      { status: 500 }
    );
  }
}
