import { NextRequest, NextResponse } from 'next/server';
import { getPineconeClient } from '@/lib/pinecone';
import { getEmbedding } from '@/lib/openai';

export async function GET(request: NextRequest) {
  try {
    // Debug: Log environment variables (mask API key for security)
    const apiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME || 'adacompliance-index';
    const environment = process.env.PINECONE_ENVIRONMENT;
    
    console.log('[Documents List] Environment check:');
    console.log(`[Documents List] PINECONE_API_KEY: ${apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET'}`);
    console.log(`[Documents List] PINECONE_INDEX_NAME: ${indexName}`);
    console.log(`[Documents List] PINECONE_ENVIRONMENT: ${environment || 'NOT SET'}`);
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'PINECONE_API_KEY environment variable is not set',
        documents: [],
        totalDocuments: 0,
        totalVectors: 0,
      }, { status: 500 });
    }

    const client = await getPineconeClient();
    const index = client.index(indexName);
    console.log(`[Documents List] Using Pinecone index: ${indexName}`);

    // First, check index statistics to see if there are any vectors
    let indexStats;
    try {
      console.log('[Documents List] Fetching index stats...');
      indexStats = await index.describeIndexStats();
      console.log('[Documents List] Index stats:', JSON.stringify(indexStats, null, 2));
    } catch (statsError) {
      console.error('[Documents List] Error getting index stats:', statsError);
      // Continue even if stats fail
      indexStats = null;
    }

    // If index has no vectors, return early with helpful message
    if (indexStats && indexStats.totalRecordCount === 0) {
      return NextResponse.json({
        success: true,
        documents: [],
        totalDocuments: 0,
        totalVectors: 0,
        message: 'No documents found in the vector database. Please vectorize documents first using the Vectorization Setup tab.',
        indexEmpty: true,
      });
    }

    // Query with multiple diverse queries to get comprehensive coverage
    // This ensures we capture documents that might not match a single generic query
    const queryTerms = [
      "document text content",
      "information data file",
      "content text information",
      "file document text",
      "text information content",
      "data content document",
      "information text",
      "document content",
    ];

    // Use a Set to deduplicate matches by vector ID
    const matchesMap = new Map<string, any>();
    const allMatches: any[] = [];

    console.log(`[Documents List] Querying with ${queryTerms.length} different terms...`);

    // Query with each term and collect unique results
    for (let i = 0; i < queryTerms.length; i++) {
      const queryTerm = queryTerms[i];
      try {
        console.log(`[Documents List] Query ${i + 1}/${queryTerms.length}: "${queryTerm}"`);
        const queryEmbedding = await getEmbedding(queryTerm);
        const maxResults = indexStats?.totalRecordCount ? Math.min(1000, indexStats.totalRecordCount) : 1000;
        const queryResponse = await index.query({
          vector: queryEmbedding,
          topK: maxResults,
          includeMetadata: true,
        });

        const termMatches = queryResponse.matches || [];
        console.log(`[Documents List] Query "${queryTerm}" returned ${termMatches.length} matches`);
        
        // Add unique matches by vector ID
        termMatches.forEach((match: any) => {
          if (!matchesMap.has(match.id)) {
            matchesMap.set(match.id, match);
            allMatches.push(match);
          }
        });

        console.log(`[Documents List] Total unique matches so far: ${allMatches.length}`);

        // If we've collected enough matches, we can stop early
        if (allMatches.length >= maxResults) {
          console.log(`[Documents List] Reached max results (${maxResults}), stopping queries`);
          break;
        }
      } catch (queryError) {
        console.error(`[Documents List] Error querying with term "${queryTerm}":`, queryError);
        // Continue with next query term
      }
    }

    const matches = allMatches;
    console.log(`[Documents List] Final match count: ${matches.length} unique vectors`);

    // Extract unique documents by fileId
    const documentMap = new Map<string, {
      fileId: string;
      title: string;
      mimeType?: string;
      modifiedTime?: string;
      chunkCount: number;
    }>();

    matches.forEach((match) => {
      // Try multiple possible metadata field names
      const fileId = match.metadata?.fileId || 
                     match.metadata?.file_id || 
                     match.metadata?.fileID ||
                     // If no fileId, try to extract from vector ID pattern (e.g., "file_id_chunk_0")
                     (match.id?.includes('_chunk_') ? match.id.split('_chunk_')[0] : null);
      
      if (!fileId) {
        // Log for debugging but don't skip - might still have useful metadata
        console.warn('Match without fileId:', match.id, match.metadata);
        // Try to create a document entry from the vector ID itself
        const fallbackId = match.id;
        if (!documentMap.has(fallbackId)) {
          documentMap.set(fallbackId, {
            fileId: fallbackId,
            title: match.metadata?.title || match.id || 'Untitled Document',
            mimeType: match.metadata?.mimeType,
            modifiedTime: match.metadata?.modifiedTime,
            chunkCount: 1,
          });
        } else {
          documentMap.get(fallbackId)!.chunkCount += 1;
        }
        return;
      }

      const existing = documentMap.get(fileId);
      if (existing) {
        // Increment chunk count
        existing.chunkCount += 1;
        // Update other fields if they're missing but present in this match
        if (!existing.mimeType && match.metadata?.mimeType) {
          existing.mimeType = match.metadata.mimeType;
        }
        if (!existing.modifiedTime && match.metadata?.modifiedTime) {
          existing.modifiedTime = match.metadata.modifiedTime;
        }
        if (existing.title === 'Untitled Document' && match.metadata?.title) {
          existing.title = match.metadata.title;
        }
      } else {
        // Create new document entry
        documentMap.set(fileId, {
          fileId,
          title: match.metadata?.title || match.metadata?.name || 'Untitled Document',
          mimeType: match.metadata?.mimeType || match.metadata?.mime_type,
          modifiedTime: match.metadata?.modifiedTime || match.metadata?.modified_time,
          chunkCount: 1,
        });
      }
    });

    // Convert map to array
    const documents = Array.from(documentMap.values());

    // Sort by title
    documents.sort((a, b) => a.title.localeCompare(b.title));

    // Log summary for debugging
    console.log(`[Documents List] Found ${matches.length} total vectors, ${documents.length} unique documents`);
    if (documents.length > 0) {
      console.log(`[Documents List] Sample document: ${documents[0].title} (${documents[0].chunkCount} chunks)`);
    }
    if (matches.length > 0 && documents.length === 0) {
      console.warn(`[Documents List] Warning: Found ${matches.length} vectors but 0 documents. Sample metadata:`, matches[0]?.metadata);
    }

    return NextResponse.json({
      success: true,
      documents,
      totalDocuments: documents.length,
      totalVectors: matches.length,
      uniqueVectorsQueried: matchesMap.size,
      indexStats: indexStats ? {
        totalVectors: indexStats.totalRecordCount,
        dimension: indexStats.dimension,
        indexFullness: indexStats.indexFullness,
      } : null,
      message: documents.length === 0 && indexStats && indexStats.totalRecordCount > 0
        ? `Found ${indexStats.totalRecordCount} vectors in the index, but unable to extract document metadata. This may indicate the vectors don't have fileId metadata.`
        : documents.length > 0 && indexStats && documents.length < (indexStats.totalRecordCount / 10)
        ? `Found ${documents.length} documents, but the index contains ${indexStats.totalRecordCount} vectors. Some documents may not have been retrieved.`
        : undefined,
    });
  } catch (error) {
    console.error('Error listing documents from Pinecone:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a Pinecone connection error
    if (errorMessage.includes('Pinecone') || errorMessage.includes('API key') || errorMessage.includes('environment')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to connect to Pinecone. Please check your environment variables (PINECONE_API_KEY, PINECONE_INDEX_NAME).',
          details: errorMessage,
          documents: [],
          totalDocuments: 0,
          totalVectors: 0,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list documents from Pinecone',
        details: errorMessage,
        documents: [],
        totalDocuments: 0,
        totalVectors: 0,
      },
      { status: 500 }
    );
  }
}
