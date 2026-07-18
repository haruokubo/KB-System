import Anthropic from '@anthropic-ai/sdk'

export interface RetrievedChunk {
  articleId: string
  text: string
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return new Anthropic({ apiKey })
}

function textOf(response: { content: Array<{ type: string; text?: string }> }): string {
  const block = response.content.find((b) => b.type === 'text')
  if (!block?.text) throw new Error('Claude response had no text block')
  return block.text
}

export async function extractMetadata(articleText: string): Promise<{
  keywords: string[]
  tags: string[]
  summary: string
  category: string
}> {
  const client = getClient()
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract metadata from this KB article as strict JSON with keys keywords (string[]), tags (string[]), summary (string), category (string). Article:\n\n${articleText}`,
    }],
  })
  return JSON.parse(textOf(response))
}

export async function synthesizeAnswer(question: string, chunks: RetrievedChunk[]): Promise<string> {
  const client = getClient()
  const context = chunks.map((c) => `[${c.articleId}] ${c.text}`).join('\n\n')
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a support troubleshooting assistant. Using only the KB excerpts below, answer the engineer's question with: probable causes, troubleshooting steps, known fixes, relevant PowerShell commands if any, and an escalation recommendation. Cite article ids in brackets like [KB-1] inline.\n\nExcerpts:\n${context}\n\nQuestion: ${question}`,
    }],
  })
  return textOf(response)
}
