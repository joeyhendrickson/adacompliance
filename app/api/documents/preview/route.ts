import { NextRequest, NextResponse } from 'next/server';
import { queryPinecone } from '@/lib/pinecone';
import { getEmbedding } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Query Pinecone for all chunks of a specific file
    // Use a generic query to get a large set of results, then filter by fileId
    const dummyQuery = fileId; // Use fileId as query to potentially get more relevant chunks
    const queryEmbedding = await getEmbedding(dummyQuery);

    // Query for a large number of results to ensure we get all chunks for this file
    const matches = await queryPinecone(queryEmbedding, 500);
    
    // Filter matches by fileId
    const filteredMatches = matches.filter(match => {
      const matchFileId = match.metadata?.fileId || match.metadata?.file_id;
      return matchFileId === fileId;
    });

    // If no matches found with fileId, try alternative approaches
    if (filteredMatches.length === 0) {
      // Try querying with a more generic approach
      const genericQuery = "text content document";
      const genericEmbedding = await getEmbedding(genericQuery);
      const genericMatches = await queryPinecone(genericEmbedding, 500);
      
      const altFiltered = genericMatches.filter(match => {
        const matchFileId = match.metadata?.fileId || match.metadata?.file_id;
        return matchFileId === fileId;
      });
      
      if (altFiltered.length > 0) {
        altFiltered.sort((a, b) => {
          const aIndex = Number(a.metadata?.chunkIndex || a.metadata?.chunk_index || 0) || 0;
          const bIndex = Number(b.metadata?.chunkIndex || b.metadata?.chunk_index || 0) || 0;
          return aIndex - bIndex;
        });
        const previewText = altFiltered
          .map((match) => match.metadata?.text || match.metadata?.content || '')
          .filter(Boolean)
          .join('\n\n');
        
        return NextResponse.json({
          success: true,
          preview: previewText || 'No content found for this document',
          fileId,
          chunkCount: altFiltered.length,
        });
      }
    }

    // Sort matches by chunkIndex to reconstruct the document order
    filteredMatches.sort((a, b) => {
      const aIndex = Number(a.metadata?.chunkIndex || a.metadata?.chunk_index || 0) || 0;
      const bIndex = Number(b.metadata?.chunkIndex || b.metadata?.chunk_index || 0) || 0;
      return aIndex - bIndex;
    });

    const previewText = filteredMatches
      .map((match) => match.metadata?.text || match.metadata?.content || '')
      .filter(Boolean)
      .join('\n\n');

    if (previewText.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No content found for this document. It may not be fully indexed in the vector database.',
        preview: '',
        fileId,
        chunkCount: 0,
      });
    }

    return NextResponse.json({
      success: true,
      preview: previewText,
      fileId,
      chunkCount: filteredMatches.length,
    });
  } catch (error) {
    console.error('Document preview API error:', error);
    return NextResponse.json(
      { error: 'Failed to get document preview' },
      { status: 500 }
    );
  }
}
