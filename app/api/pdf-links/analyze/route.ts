import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { extractTextFromDocument, findRelevantContext } from '@/lib/document-processor';
import { chatCompletion } from '@/lib/openai';

export const maxDuration = 300; // 5 minutes (Vercel Hobby plan limit)

async function fetchPDF(url: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ADA Compliance PDF Analyzer)',
      },
      maxRedirects: 5,
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error fetching PDF ${url}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'URLs array is required' },
        { status: 400 }
      );
    }

    if (urls.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 PDFs allowed' },
        { status: 400 }
      );
    }

    const results = [];

    for (const url of urls) {
      try {
        // Fetch PDF
        const pdfBuffer = await fetchPDF(url);

        if (!pdfBuffer) {
          results.push({
            url,
            success: false,
            error: 'Failed to fetch PDF',
            risks: [],
            summary: 'Unable to fetch PDF for analysis',
            riskLevel: 'high',
            wcagConformance: {
              level: 'Non-conformant',
              passedCriteria: [],
              failedCriteria: [{
                criterion: 'N/A',
                name: 'Unable to analyze',
                level: 'AA',
                description: 'PDF could not be fetched',
                impact: 'Cannot determine compliance status',
              }],
              warnings: [],
            },
          });
          continue;
        }

        // Extract text from PDF
        const text = await extractTextFromDocument(pdfBuffer, 'application/pdf');

        if (!text || text.trim().length === 0) {
          results.push({
            url,
            success: false,
            error: 'No text extracted from PDF',
            risks: [],
            summary: 'Unable to extract text for analysis',
            riskLevel: 'high',
            wcagConformance: {
              level: 'Non-conformant',
              passedCriteria: [],
              failedCriteria: [{
                criterion: 'N/A',
                name: 'Unable to analyze',
                level: 'AA',
                description: 'PDF could not be processed',
                impact: 'Cannot determine compliance status',
              }],
              warnings: [],
            },
          });
          continue;
        }

        // Get WCAG 2.1 AA context from knowledge base
        const wcagContext = await findRelevantContext('WCAG 2.1 AA compliance standards requirements', 10);

        // Analyze for ADA compliance issues using AI with WCAG 2.1 AA context
        const analysisPrompt = `You are an expert in WCAG 2.1 AA compliance. Analyze the following PDF content against WCAG 2.1 AA standards.

WCAG 2.1 AA Standards Context:
${wcagContext}

PDF Content (first 8000 characters):
${text.substring(0, 8000)}

Analyze the PDF for compliance with WCAG 2.1 AA standards. Focus on:
1. Perceivable: Alt text for images, captions, color contrast, text alternatives
2. Operable: Keyboard navigation, focus indicators, no seizure-inducing content
3. Understandable: Language declaration, consistent navigation, form labels, error identification
4. Robust: Document structure, tagging, reading order, metadata

Provide a comprehensive WCAG 2.1 AA conformance report with this JSON structure:
{
  "risks": ["specific WCAG 2.1 AA violation 1", "specific WCAG 2.1 AA violation 2", ...],
  "summary": "Overall compliance summary against WCAG 2.1 AA",
  "riskLevel": "low" | "medium" | "high",
  "wcagConformance": {
    "level": "A" | "AA" | "AAA" | "Non-conformant",
    "passedCriteria": ["WCAG criterion that passed", ...],
    "failedCriteria": [
      {
        "criterion": "WCAG 2.1 criterion code (e.g., 1.1.1)",
        "name": "Criterion name",
        "level": "A" | "AA" | "AAA",
        "description": "Why this criterion failed",
        "impact": "Impact on users"
      }
    ],
    "warnings": ["Potential issues that may not be violations", ...]
  }
}

Only return valid JSON, no other text.`;

        const analysisResponse = await chatCompletion(
          [
            {
              role: 'user',
              content: analysisPrompt,
            },
          ],
          wcagContext,
          { temperature: 0.3 }
        );

        // Parse AI response
        let analysis;
        try {
          const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          analysis = {
            risks: ['Unable to parse detailed analysis'],
            summary: 'Analysis completed but detailed results unavailable',
            riskLevel: 'medium',
            wcagConformance: {
              level: 'Non-conformant',
              passedCriteria: [],
              failedCriteria: [],
              warnings: ['Analysis parsing failed'],
            },
          };
        }

        results.push({
          url,
          success: true,
          risks: analysis.risks || [],
          summary: analysis.summary || 'Analysis completed',
          riskLevel: analysis.riskLevel || 'medium',
          wcagConformance: analysis.wcagConformance || {
            level: 'Non-conformant',
            passedCriteria: [],
            failedCriteria: [],
            warnings: [],
          },
        });
      } catch (error) {
        console.error(`Error analyzing PDF ${url}:`, error);
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          risks: [],
          summary: 'Analysis failed',
          riskLevel: 'high',
          wcagConformance: {
            level: 'Non-conformant',
            passedCriteria: [],
            failedCriteria: [],
            warnings: [],
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('PDF link analysis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze PDFs',
      },
      { status: 500 }
    );
  }
}
