import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { chatCompletion } from '@/lib/openai';

export const maxDuration = 600; // 10 minutes

async function fetchPageContent(url: string): Promise<{ html: string; text: string } | null> {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ADA Compliance Scanner)',
      },
      maxRedirects: 5,
    });

    const html = response.data;
    
    // Extract text content from HTML (simple approach)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 10000); // Limit text for analysis

    return { html, text: textContent };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

interface DocumentStructure {
  semanticElements: {
    main: number;
    nav: number;
    article: number;
    section: number;
    aside: number;
    header: number;
    footer: number;
  };
  headingHierarchy: Array<{ level: number; count: number; order: number[] }>;
  formStructure: Array<{
    id: string;
    hasLabel: boolean;
    hasAriaLabel: boolean;
    hasAriaLabelledBy: boolean;
    type: string;
  }>;
  tableStructure: Array<{
    hasHeaders: boolean;
    hasScope: boolean;
    hasCaption: boolean;
    hasSummary: boolean;
  }>;
  ariaRoles: string[];
  landmarks: string[];
  issues: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high'; tag?: string; location?: string }>;
}

function analyzeHTMLStructure(html: string): DocumentStructure {
  const issues: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high'; tag?: string; location?: string }> = [];
  
  // Document-level analysis
  const semanticElements = {
    main: (html.match(/<main[^>]*>/gi) || []).length,
    nav: (html.match(/<nav[^>]*>/gi) || []).length,
    article: (html.match(/<article[^>]*>/gi) || []).length,
    section: (html.match(/<section[^>]*>/gi) || []).length,
    aside: (html.match(/<aside[^>]*>/gi) || []).length,
    header: (html.match(/<header[^>]*>/gi) || []).length,
    footer: (html.match(/<footer[^>]*>/gi) || []).length,
  };

  // Check for main landmark
  if (semanticElements.main === 0) {
    issues.push({
      type: 'Missing Main Landmark',
      description: 'No <main> element found - missing primary content landmark',
      severity: 'high',
      tag: 'main',
    });
  } else if (semanticElements.main > 1) {
    issues.push({
      type: 'Multiple Main Elements',
      description: `Multiple <main> elements found (${semanticElements.main}) - should be only one`,
      severity: 'high',
      tag: 'main',
    });
  }

  // Heading hierarchy analysis
  const headingMatches = html.match(/<h([1-6])[^>]*>/gi) || [];
  const headingHierarchy: Array<{ level: number; count: number; order: number[] }> = [];
  const headingOrder: number[] = [];
  
  for (let i = 1; i <= 6; i++) {
    const levelMatches = html.match(new RegExp(`<h${i}[^>]*>`, 'gi')) || [];
    headingHierarchy.push({
      level: i,
      count: levelMatches.length,
      order: [],
    });
  }

  // Extract heading order
  headingMatches.forEach((match: string) => {
    const levelMatch = match.match(/<h([1-6])/i);
    if (levelMatch) {
      headingOrder.push(parseInt(levelMatch[1]));
    }
  });

  // Check heading hierarchy violations
  if (headingOrder.length > 0) {
    for (let i = 1; i < headingOrder.length; i++) {
      const current = headingOrder[i];
      const previous = headingOrder[i - 1];
      if (current > previous + 1) {
        issues.push({
          type: 'Heading Hierarchy Violation',
          description: `Heading level jumps from H${previous} to H${current} - should not skip levels`,
          severity: 'medium',
          tag: `h${current}`,
          location: `Heading ${i + 1}`,
        });
      }
    }

    if (headingOrder[0] !== 1) {
      issues.push({
        type: 'Missing H1',
        description: 'Document does not start with H1 heading',
        severity: 'high',
        tag: 'h1',
      });
    }
  } else {
    issues.push({
      type: 'No Heading Structure',
      description: 'No heading elements found - document lacks structure',
      severity: 'high',
    });
  }

  // Image analysis with detailed tagging
  const imageMatches = html.match(/<img[^>]*>/gi) || [];
  imageMatches.forEach((img: string, index: number) => {
    const hasAlt = img.includes('alt=');
    const altMatch = img.match(/alt=["']([^"']*)["']/i);
    const altValue = altMatch ? altMatch[1] : '';
    const hasAriaLabel = img.includes('aria-label=');
    const isDecorative = img.includes('role="presentation"') || img.includes('aria-hidden="true"');

    if (!hasAlt && !hasAriaLabel && !isDecorative) {
      issues.push({
        type: 'Missing Image Alt Text',
        description: `Image ${index + 1} missing alt text attribute`,
        severity: 'high',
        tag: 'img',
        location: `Image ${index + 1}`,
      });
    } else if (hasAlt && altValue.trim() === '' && !isDecorative) {
      issues.push({
        type: 'Empty Alt Text',
        description: `Image ${index + 1} has empty alt text - should have description or be marked decorative`,
        severity: 'high',
        tag: 'img',
        location: `Image ${index + 1}`,
      });
    }
  });

  // Form structure analysis
  const formStructure: Array<{
    id: string;
    hasLabel: boolean;
    hasAriaLabel: boolean;
    hasAriaLabelledBy: boolean;
    type: string;
  }> = [];
  
  const inputMatches = html.match(/<input[^>]*>/gi) || [];
  const textareaMatches = html.match(/<textarea[^>]*>/gi) || [];
  const selectMatches = html.match(/<select[^>]*>/gi) || [];
  const allFormFields = [...inputMatches, ...textareaMatches, ...selectMatches];

  allFormFields.forEach((field: string, index: number) => {
    const idMatch = field.match(/id=["']([^"']+)["']/i);
    const nameMatch = field.match(/name=["']([^"']+)["']/i);
    const typeMatch = field.match(/type=["']([^"']+)["']/i);
    const fieldId = idMatch ? idMatch[1] : nameMatch ? nameMatch[1] : `field-${index}`;
    const fieldType = typeMatch ? typeMatch[1] : field.includes('<select') ? 'select' : field.includes('<textarea') ? 'textarea' : 'text';

    // Check for associated label
    const hasLabel = idMatch ? html.includes(`<label[^>]*for=["']${fieldId}["']`) : false;
    const hasAriaLabel = field.includes('aria-label=');
    const hasAriaLabelledBy = field.includes('aria-labelledby=');

    formStructure.push({
      id: fieldId,
      hasLabel,
      hasAriaLabel,
      hasAriaLabelledBy,
      type: fieldType,
    });

    if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy && fieldType !== 'hidden') {
      issues.push({
        type: 'Unlabeled Form Field',
        description: `Form field "${fieldId}" (${fieldType}) missing label association`,
        severity: 'high',
        tag: field.includes('<input') ? 'input' : field.includes('<select') ? 'select' : 'textarea',
        location: `Field: ${fieldId}`,
      });
    }
  });

  // Table structure analysis
  const tableStructure: Array<{
    hasHeaders: boolean;
    hasScope: boolean;
    hasCaption: boolean;
    hasSummary: boolean;
  }> = [];
  
  const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];
  tableMatches.forEach((table: string, index: number) => {
    const hasHeaders = table.includes('<th');
    const hasScope = table.match(/<th[^>]*scope=["']/i) !== null;
    const hasCaption = table.includes('<caption');
    const hasSummary = table.match(/summary=["']/i) !== null;

    tableStructure.push({
      hasHeaders,
      hasScope,
      hasCaption,
      hasSummary,
    });

    if (!hasHeaders) {
      issues.push({
        type: 'Table Missing Headers',
        description: `Table ${index + 1} missing <th> header cells`,
        severity: 'high',
        tag: 'table',
        location: `Table ${index + 1}`,
      });
    }

    if (hasHeaders && !hasScope) {
      issues.push({
        type: 'Table Headers Missing Scope',
        description: `Table ${index + 1} headers missing scope attribute`,
        severity: 'medium',
        tag: 'th',
        location: `Table ${index + 1}`,
      });
    }

    const trMatches = table.match(/<tr[^>]*>/gi);
    if (!hasCaption && trMatches && trMatches.length > 1) {
      issues.push({
        type: 'Table Missing Caption',
        description: `Table ${index + 1} missing <caption> element`,
        severity: 'medium',
        tag: 'table',
        location: `Table ${index + 1}`,
      });
    }
  });

  // ARIA roles and landmarks analysis
  const ariaRoleMatches = html.match(/role=["']([^"']+)["']/gi) || [];
  const ariaRoles = ariaRoleMatches.map(m => {
    const roleMatch = m.match(/role=["']([^"']+)["']/i);
    return roleMatch ? roleMatch[1] : '';
  }).filter(r => r);

  const landmarks = [
    ...(semanticElements.main > 0 ? ['main'] : []),
    ...(semanticElements.nav > 0 ? ['navigation'] : []),
    ...(semanticElements.header > 0 ? ['banner'] : []),
    ...(semanticElements.footer > 0 ? ['contentinfo'] : []),
    ...(semanticElements.aside > 0 ? ['complementary'] : []),
    ...(semanticElements.article > 0 ? ['article'] : []),
  ];

  // Check for skip navigation
  const skipLinks = html.match(/<a[^>]*href=["']#(main|content|main-content)[^"']*["'][^>]*>/gi) || [];
  if (skipLinks.length === 0 && semanticElements.main > 0) {
    issues.push({
      type: 'Missing Skip Navigation',
      description: 'No skip navigation link found to main content',
      severity: 'medium',
      tag: 'a',
    });
  }

  // Language declaration
  const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
  if (!langMatch) {
    issues.push({
      type: 'Missing Language Declaration',
      description: 'HTML element missing lang attribute',
      severity: 'high',
      tag: 'html',
    });
  }

  // Document outline and structure
  if (semanticElements.section === 0 && semanticElements.article === 0 && headingMatches.length === 0) {
    issues.push({
      type: 'Poor Document Structure',
      description: 'Document lacks semantic structure elements and headings',
      severity: 'high',
    });
  }

  // Check for proper landmark nesting
  const mainInOther = html.match(/<main[^>]*>[\s\S]*<(nav|header|footer|aside)[^>]*>/gi);
  if (mainInOther) {
    issues.push({
      type: 'Improper Landmark Nesting',
      description: '<main> element should not be nested inside other landmarks',
      severity: 'medium',
      tag: 'main',
    });
  }

  return {
    semanticElements,
    headingHierarchy: headingHierarchy.filter(h => h.count > 0),
    formStructure,
    tableStructure,
    ariaRoles,
    landmarks,
    issues,
  };
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
        { success: false, error: 'Maximum 100 URLs allowed' },
        { status: 400 }
      );
    }

    const results = [];

    for (const url of urls) {
      try {
        const pageContent = await fetchPageContent(url);

        if (!pageContent) {
          results.push({
            url,
            success: false,
            error: 'Failed to fetch page content',
            risks: [],
            summary: 'Unable to analyze - page could not be fetched',
            riskLevel: 'high',
            issues: [],
          });
          continue;
        }

        // Analyze HTML structure at document and tagging level
        const structureAnalysis = analyzeHTMLStructure(pageContent.html);

        // Extract detailed HTML structure for AI analysis
        const structureDetails = {
          semanticElements: structureAnalysis.semanticElements,
          headingCount: structureAnalysis.headingHierarchy.reduce((sum, h) => sum + h.count, 0),
          formFields: structureAnalysis.formStructure.length,
          labeledFields: structureAnalysis.formStructure.filter(f => f.hasLabel || f.hasAriaLabel).length,
          tables: structureAnalysis.tableStructure.length,
          tablesWithHeaders: structureAnalysis.tableStructure.filter(t => t.hasHeaders).length,
          ariaRoles: structureAnalysis.ariaRoles.length,
          landmarksCount: structureAnalysis.landmarks.length,
          documentIssues: structureAnalysis.issues.length,
        };

        // Use AI to analyze content for ADA compliance with document/tagging level focus
        const analysisPrompt = `You are an expert in web accessibility. Analyze the following webpage for ADA compliance issues at the document structure and HTML tagging level.

Webpage Content (first 8000 characters):
${pageContent.text}

Document Structure Analysis:
- Semantic Elements: main=${structureDetails.semanticElements.main}, nav=${structureDetails.semanticElements.nav}, article=${structureDetails.semanticElements.article}, section=${structureDetails.semanticElements.section}
- Heading Structure: ${structureDetails.headingCount} headings found
- Form Fields: ${structureDetails.formFields} total, ${structureDetails.labeledFields} properly labeled
- Tables: ${structureDetails.tables} total, ${structureDetails.tablesWithHeaders} with headers
- ARIA Roles: ${structureDetails.ariaRoles} roles found
- Landmarks: ${structureDetails.landmarksCount} landmark regions
- Document-level Issues: ${structureDetails.documentIssues} issues identified

Focus your analysis on:
1. Document structure and semantic HTML5 elements
2. Tag hierarchy and relationships (parent-child, sibling relationships)
3. ARIA roles, properties, and states at the element level
4. Form field associations and relationships
5. Table structure, headers, and data relationships
6. Heading hierarchy and document outline
7. Landmark regions and navigation structure
8. Link relationships and context
9. Image-text relationships
10. Content reading order based on DOM structure

Provide a JSON response with this structure:
{
  "risks": ["specific document/tagging level issue 1", "specific document/tagging level issue 2", ...],
  "summary": "Overall compliance summary focusing on document structure and tagging",
  "riskLevel": "low" | "medium" | "high",
  "documentLevelIssues": [
    {
      "type": "Issue type",
      "description": "Detailed description",
      "tag": "HTML tag involved",
      "location": "Where in document",
      "severity": "low" | "medium" | "high"
    }
  ]
}

Only return valid JSON, no other text.`;

        const analysisResponse = await chatCompletion(
          [
            {
              role: 'user',
              content: analysisPrompt,
            },
          ],
          undefined,
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
          };
        }

        // Combine structure issues with AI analysis
        const documentLevelIssues = analysis.documentLevelIssues || [];
        const allIssues = [
          ...structureAnalysis.issues,
          ...documentLevelIssues,
        ];

        const allRisks = [
          ...analysis.risks || [],
          ...allIssues.map(i => i.description || `${i.type}: ${i.description}`),
        ];

        // Determine overall risk level
        const highSeverityIssues = allIssues.filter(i => i.severity === 'high').length;
        const mediumSeverityIssues = allIssues.filter(i => i.severity === 'medium').length;
        
        let overallRiskLevel = analysis.riskLevel || 'low';
        if (highSeverityIssues > 0 || allRisks.length > 5) {
          overallRiskLevel = 'high';
        } else if (mediumSeverityIssues > 0 || allRisks.length > 2) {
          overallRiskLevel = 'medium';
        }

        results.push({
          url,
          success: true,
          risks: allRisks,
          summary: analysis.summary || 'Analysis completed',
          riskLevel: overallRiskLevel,
          issues: allIssues,
          documentStructure: {
            semanticElements: structureAnalysis.semanticElements,
            headingHierarchy: structureAnalysis.headingHierarchy,
            formStructure: structureAnalysis.formStructure,
            tableStructure: structureAnalysis.tableStructure,
            ariaRoles: structureAnalysis.ariaRoles,
            landmarks: structureAnalysis.landmarks,
          },
        });
      } catch (error) {
        console.error(`Error analyzing ${url}:`, error);
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          risks: [],
          summary: 'Analysis failed',
          riskLevel: 'high',
          issues: [],
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Website analysis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze websites',
      },
      { status: 500 }
    );
  }
}
