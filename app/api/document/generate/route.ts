import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromDocument, generateDocument } from '@/lib/document-processor';
import { chatCompletion } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const templateFile = formData.get('templateFile') as File;
    const sections = JSON.parse(formData.get('sections') as string);
    const outputFormat = formData.get('outputFormat') as string || 'same';

    if (!templateFile || !sections || !Array.isArray(sections)) {
      return NextResponse.json(
        { error: 'Template file and sections are required' },
        { status: 400 }
      );
    }

    // Extract original template content
    const fileMimeType = templateFile.type;
    const originalContent = await extractTextFromDocument(templateFile, fileMimeType);

    // Determine file type
    let fileType: 'docx' | 'pdf' | 'txt' = 'txt';
    if (fileMimeType.includes('pdf')) {
      fileType = 'pdf';
    } else if (
      fileMimeType.includes('wordprocessingml') ||
      fileMimeType.includes('msword') ||
      templateFile.name.endsWith('.docx')
    ) {
      fileType = 'docx';
    } else if (fileMimeType.includes('text') || templateFile.name.endsWith('.txt')) {
      fileType = 'txt';
    }

    // Reconstruct document with filled sections
    const mergePrompt = `You are reconstructing a document by merging filled sections into the original template structure.

Original Template Structure:
${originalContent}

Filled Sections:
${sections.map((s: { title: string; content: string }) => `\n[${s.title}]:\n${s.content}`).join('\n\n---\n')}

Task: Merge the filled sections into the original template, preserving:
1. The EXACT structure, headings, and formatting of the original template
2. All section titles and headings exactly as they appear
3. The order and organization of the original document
4. Any formatting, bullet points, numbered lists, etc.

Replace section content with the filled versions while maintaining the exact template structure. Return the complete merged document.`;

    const mergedContent = await chatCompletion(
      [
        {
          role: 'system',
          content: 'You are reconstructing documents by merging filled content into original templates. You must preserve the exact structure, headings, formatting, and organization of the original template.',
        },
        {
          role: 'user',
          content: mergePrompt,
        },
      ],
      undefined,
      { temperature: 0.2, preserveSystemMessage: true }
    );

    // Determine output format
    let outputType: 'docx' | 'pdf' | 'txt' | 'html' = fileType;
    if (outputFormat !== 'same') {
      if (outputFormat === 'docx') outputType = 'docx';
      else if (outputFormat === 'pdf') outputType = 'pdf';
      else if (outputFormat === 'txt') outputType = 'txt';
      else if (outputFormat === 'html') outputType = 'html';
    }

    // Generate the final document
    const filename = templateFile.name.replace(/\.[^/.]+$/, '') || 'document';
    const documentBuffer = await generateDocument(
      mergedContent.trim(),
      outputType,
      filename
    );

    // Determine MIME type
    let mimeType = 'text/plain';
    let fileExtension = 'txt';
    
    if (outputType === 'pdf') {
      mimeType = 'application/pdf';
      fileExtension = 'pdf';
    } else if (outputType === 'docx') {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileExtension = 'docx';
    } else if (outputType === 'html') {
      mimeType = 'text/html';
      fileExtension = 'html';
    }

    const base64Document = documentBuffer.toString('base64');

    return NextResponse.json({
      success: true,
      document: base64Document,
      filename: `${filename}_filled.${fileExtension}`,
      mimeType,
    });
  } catch (error) {
    console.error('Document generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate document', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
