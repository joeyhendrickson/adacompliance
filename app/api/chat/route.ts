import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion, getEmbedding } from '@/lib/openai';
import { queryPinecone } from '@/lib/pinecone';

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get embedding for the user's message
    const queryEmbedding = await getEmbedding(message);

    // Query Pinecone for relevant context
    const matches = await queryPinecone(queryEmbedding, 5);

    // Calculate a simple confidence score based on the highest match score
    const confidenceScore = matches.length > 0 ? matches[0].score || 0 : 0;

    // Build context from Pinecone results and extract sources
    const context = matches
      .map((match) => {
        const metadata = match.metadata || {};
        return `[${metadata.title || 'Document'}]: ${metadata.text || match.id}`;
      })
      .join('\n\n');

    const sources = matches.map((match) => ({
      id: match.id,
      title: match.metadata?.title || 'Untitled Document',
      text: match.metadata?.text || '',
      score: match.score || 0,
      fileId: match.metadata?.fileId || '',
      chunkIndex: match.metadata?.chunkIndex || 0,
    }));

    // Prepare chat history
    const messages = history.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Add current message
    messages.push({
      role: 'user',
      content: message,
    });

    // Get response from OpenAI with context
    let response = await chatCompletion(messages, context);

    // Remove asterisks from response
    response = response.replace(/\*\*/g, '');

    return NextResponse.json({
      response,
      contextUsed: matches.length > 0,
      sources,
      confidenceScore,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}
