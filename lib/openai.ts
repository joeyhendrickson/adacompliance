import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key must be set');
  }

  openaiClient = new OpenAI({
    apiKey: apiKey,
  });

  return openaiClient;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    // Using default 1536 dimensions for maximum accuracy
  });

  return response.data[0].embedding;
}

export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  context?: string,
  options?: { temperature?: number; preserveSystemMessage?: boolean }
) {
  const client = getOpenAIClient();

  // Check if a system message is already in the messages array
  const hasSystemMessage = messages.some(msg => msg.role === 'system');
  
  const systemMessage = hasSystemMessage && options?.preserveSystemMessage
    ? undefined // Don't add default system message if one is provided and we want to preserve it
    : context
    ? `You are an intelligent advisor for ADA Compliance transformation. Use the following context from the knowledge base to answer questions accurately and helpfully:\n\n${context}\n\nIf the context doesn't contain relevant information, use your general knowledge but indicate when you're doing so.`
    : 'You are an intelligent advisor for ADA Compliance transformation. Provide helpful, accurate information about project management and ADA compliance.';

  const allMessages = systemMessage 
    ? [{ role: 'system' as const, content: systemMessage }, ...messages]
    : messages;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: allMessages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: 4000, // Increased for longer template filling
  });

  return response.choices[0]?.message?.content || '';
}

