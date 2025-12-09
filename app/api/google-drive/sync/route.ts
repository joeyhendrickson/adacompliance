import { NextRequest, NextResponse } from 'next/server';
import { listFilesInFolder, getFileContent } from '@/lib/google-drive';
import { extractTextFromDocument } from '@/lib/document-processor';
import { getEmbedding } from '@/lib/openai';
import { upsertToPinecone } from '@/lib/pinecone';

export async function POST(request: NextRequest) {
  try {
    const folderId =
      request.nextUrl.searchParams.get('folderId') ||
      process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) {
      return NextResponse.json(
        { error: 'Folder ID is required' },
        { status: 400 }
      );
    }

    console.log(`📁 Fetching files from Google Drive folder: ${folderId}`);
    const files = await listFilesInFolder(folderId);
    console.log(`✅ Found ${files.length} file(s)\n`);

    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No files found in the folder',
        totalFiles: 0,
        totalChunks: 0,
        processedFiles: [],
      });
    }

    const processedFiles: Array<{ name: string; chunks: number; error?: string }> = [];
    let totalChunks = 0;
    const failedFileDetails: Array<{ name: string; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.id || !file.name) continue;

      try {
        console.log(`Processing file ${i + 1}/${files.length}: ${file.name} (${file.id})`);
        
        const buffer = await getFileContent(file.id, file.mimeType || 'text/plain');
        console.log(`Downloaded file, buffer size: ${buffer.length} bytes`);

        if (buffer.length === 0) {
          console.warn(`File ${file.name} has zero bytes`);
          processedFiles.push({
            name: file.name,
            chunks: 0,
            error: 'File is empty (0 bytes)',
          });
          continue;
        }

        const text = await extractTextFromDocument(buffer, file.mimeType || 'text/plain');
        console.log(`Extracted text length: ${text.length} characters`);

        if (!text || text.trim().length === 0) {
          console.warn(`No text extracted from file ${file.name}`);
          processedFiles.push({
            name: file.name,
            chunks: 0,
            error: 'No text extracted',
          });
          continue;
        }

        // Chunk the text
        let chunks: string[] = [];
        const paragraphChunks = text.split(/\n\n+/).filter((chunk) => chunk.trim().length > 20);
        
        if (paragraphChunks.length > 0) {
          chunks = paragraphChunks;
        } else {
          const sentenceChunks = text.split(/[.!?]+\s+/).filter((chunk) => chunk.trim().length > 20);
          if (sentenceChunks.length > 0) {
            chunks = sentenceChunks;
          } else {
            // Fixed-size fallback
            const chunkSize = 500;
            for (let i = 0; i < text.length; i += chunkSize) {
              const chunk = text.substring(i, i + chunkSize).trim();
              if (chunk.length > 20) {
                chunks.push(chunk);
              }
            }
          }
        }

        if (chunks.length === 0) {
          console.warn(`No valid chunks created for file ${file.name}`);
          processedFiles.push({
            name: file.name,
            chunks: 0,
            error: 'No valid chunks created',
          });
          continue;
        }

        // Create embeddings and upsert to Pinecone
        const vectors = [];
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex];
          const embedding = await getEmbedding(chunk);
          
          vectors.push({
            id: `${file.id}-chunk-${chunkIndex}`,
            values: embedding,
            metadata: {
              fileId: file.id,
              title: file.name,
              text: chunk,
              chunkIndex,
              mimeType: file.mimeType,
            },
          });
        }

        await upsertToPinecone(vectors);
        console.log(`✅ Upserted ${vectors.length} chunks for ${file.name}`);

        totalChunks += vectors.length;
        processedFiles.push({
          name: file.name,
          chunks: vectors.length,
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failedFileDetails.push({
          name: file.name,
          error: errorMessage,
        });
        processedFiles.push({
          name: file.name,
          chunks: 0,
          error: errorMessage,
        });
      }
    }

    const message = totalChunks > 0
      ? `Successfully processed ${processedFiles.length} file(s) and created ${totalChunks} chunk(s) in Pinecone!`
      : `⚠️ No chunks were created. ${processedFiles.length} file(s) processed but no valid chunks found. Check file types and content.`;

    return NextResponse.json({
      success: true,
      message,
      totalFiles: processedFiles.length,
      totalChunks,
      processedFiles,
      ...(failedFileDetails.length > 0 && { failedFileDetails }),
    });
  } catch (error) {
    console.error('Google Drive sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync Google Drive files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
