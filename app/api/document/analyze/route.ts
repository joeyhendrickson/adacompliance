import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocument } from '@/lib/document-processor';
import { chatCompletion } from '@/lib/openai';

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  placeholder?: string;
  order: number;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check if file is actually a File object
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Invalid file object' },
        { status: 400 }
      );
    }

    // Determine file type
    const fileMimeType = file.type;
    let fileType: 'docx' | 'pdf' | 'txt' = 'txt';

    if (fileMimeType.includes('pdf')) {
      fileType = 'pdf';
    } else if (
      fileMimeType.includes('wordprocessingml') ||
      fileMimeType.includes('msword') ||
      file.name.endsWith('.docx')
    ) {
      fileType = 'docx';
    } else if (fileMimeType.includes('text') || file.name.endsWith('.txt')) {
      fileType = 'txt';
    }

    // Extract text from document
    let templateContent: string;
    try {
      templateContent = await extractTextFromDocument(file, fileMimeType);
      if (!templateContent || templateContent.trim().length === 0) {
        return NextResponse.json(
          { error: 'Document appears to be empty or could not extract text' },
          { status: 400 }
        );
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
      return NextResponse.json(
        { error: 'Failed to extract text from document', details: extractError instanceof Error ? extractError.message : 'Unknown error' },
        { status: 400 }
      );
    }

    // Use AI to analyze the document structure and identify sections
    const analysisPrompt = `Analyze the following document template and identify distinct sections that need to be filled in. 

Document Content:
${templateContent}

Please identify sections based on:
1. Headings (marked with #, ALL CAPS, numbered lists, or clear section titles)
2. Placeholders (marked with {{placeholder}} or [PLACEHOLDER])
3. Empty or incomplete areas
4. Logical document sections (Introduction, Objectives, Timeline, etc.)

For each section, provide:
- A clear section title/heading
- The current content (which may be empty, a placeholder, or partial content)
- Whether it contains a placeholder

Return your analysis as a JSON array with this structure:
[
  {
    "title": "Section Title",
    "content": "Current content or placeholder text",
    "hasPlaceholder": true/false,
    "placeholder": "placeholder name if exists"
  }
]

Only return the JSON array, no other text.`;

    const analysisResult = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You are a document structure analyzer. Analyze documents and identify sections that need to be filled in. Return only valid JSON arrays.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      undefined,
      { temperature: 0.3, preserveSystemMessage: true }
    );

    // Parse the JSON response
    let sections: DocumentSection[] = [];
    try {
      // Extract JSON from response (handle cases where AI adds extra text)
      const jsonMatch = analysisResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        sections = JSON.parse(jsonMatch[0]);
      } else {
        sections = JSON.parse(analysisResult);
      }

      // Add IDs and order to sections
      sections = sections.map((section, index) => ({
        ...section,
        id: `section-${index}`,
        order: index,
      }));
    } catch (parseError) {
      console.error('Error parsing analysis result:', parseError);
      // Fallback: create a single section
      sections = [
        {
          id: 'section-0',
          title: 'Document Content',
          content: templateContent,
          order: 0,
        },
      ];
    }

    return NextResponse.json({
      success: true,
      sections,
      originalContent: templateContent,
      fileType,
      filename: file.name,
    });
  } catch (error) {
    console.error('Document analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: 'Failed to analyze document', 
        details: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
      },
      { status: 500 }
    );
  }
}
