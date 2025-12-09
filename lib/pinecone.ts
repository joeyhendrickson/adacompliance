import { Pinecone } from '@pinecone-database/pinecone';

let pineconeClient: Pinecone | null = null;

export async function getPineconeClient(): Promise<Pinecone> {
  if (pineconeClient) {
    return pineconeClient;
  }

  const apiKey = process.env.PINECONE_API_KEY;
  const environment = process.env.PINECONE_ENVIRONMENT;

  if (!apiKey || !environment) {
    throw new Error('Pinecone API key and environment must be set');
  }

  pineconeClient = new Pinecone({
    apiKey: apiKey,
  });

  return pineconeClient;
}

export async function queryPinecone(
  queryVector: number[],
  topK: number = 5,
  namespace?: string
) {
  const client = await getPineconeClient();
  const indexName = process.env.PINECONE_INDEX_NAME || 'adacompliance-index';
  const index = client.index(indexName);

  if (namespace) {
    const queryResponse = await index.namespace(namespace).query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });
    return queryResponse.matches || [];
  } else {
    const queryResponse = await index.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });
    return queryResponse.matches || [];
  }
}

export async function upsertToPinecone(
  vectors: Array<{
    id: string;
    values: number[];
    metadata?: Record<string, any>;
  }>,
  namespace?: string
) {
  const client = await getPineconeClient();
  const indexName = process.env.PINECONE_INDEX_NAME || 'adacompliance-index';
  const index = client.index(indexName);

  console.log(`Upserting ${vectors.length} vector(s) to Pinecone index: ${indexName}`);
  if (namespace) {
    console.log(`Using namespace: ${namespace}`);
  }
  console.log(`Vector IDs: ${vectors.map(v => v.id).join(', ')}`);
  console.log(`Vector dimensions: ${vectors[0]?.values.length || 'N/A'}`);
  
  try {
    // Use namespace if provided
    if (namespace) {
      const result = await index.namespace(namespace).upsert(vectors);
      console.log(`Successfully upserted ${vectors.length} vector(s) to Pinecone namespace: ${namespace}`);
      return result;
    } else {
      const result = await index.upsert(vectors);
      console.log(`Successfully upserted ${vectors.length} vector(s) to Pinecone (default namespace)`);
      return result;
    }
  } catch (error) {
    console.error('Pinecone upsert error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to upsert to Pinecone: ${errorMessage}`);
  }
}

