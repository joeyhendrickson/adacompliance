import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocument, findRelevantContext } from '@/lib/document-processor';
import { chatCompletion } from '@/lib/openai';

export const maxDuration = 300; // 5 minutes for processing multiple PDFs

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFiles = formData.getAll('pdfs') as File[];

    if (!pdfFiles || pdfFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No PDF files provided' },
        { status: 400 }
      );
    }

    if (pdfFiles.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Maximum 10 PDFs allowed per request' },
        { status: 400 }
      );
    }

    const results = [];

    for (const pdfFile of pdfFiles) {
      try {
        // Extract text from PDF
        const text = await extractTextFromDocument(pdfFile, pdfFile.type);

        if (!text || text.trim().length === 0) {
          results.push({
            filename: pdfFile.name,
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
                description: 'PDF could not be processed for analysis',
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
          // Try to extract JSON from response
          const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          // Fallback analysis if JSON parsing fails
          analysis = {
            risks: ['Unable to parse detailed analysis'],
            summary: 'PDF analyzed but detailed results unavailable',
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
          filename: pdfFile.name,
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
        console.error(`Error analyzing PDF ${pdfFile.name}:`, error);
        results.push({
          filename: pdfFile.name,
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
    console.error('PDF analysis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze PDFs',
      },
      { status: 500 }
    );
  }
}
