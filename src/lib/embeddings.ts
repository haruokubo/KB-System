import OpenAI from 'openai'

function getClient(): OpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  if (!endpoint || !apiKey) throw new Error('AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY not set')
  return new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT}`,
    defaultQuery: { 'api-version': '2024-06-01' },
    defaultHeaders: { 'api-key': apiKey },
  })
}

export async function embed(texts: string[]): Promise<number[][]> {
  const client = getClient()
  const response = await client.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? '',
    input: texts,
  })
  if (response.data.length !== texts.length) {
    throw new Error(
      `embed: expected ${texts.length} embeddings but received ${response.data.length}`
    )
  }
  // The API returns each item's original position in its `index` field. Sort on it
  // rather than trusting array order, so callers can always zip the result 1:1 with `texts`.
  return [...response.data]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}
