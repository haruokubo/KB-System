import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export interface RetrievedChunk {
  articleId: string
  text: string
}

const metadataSchema = z.object({
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  summary: z.string(),
  category: z.string(),
})

export type ExtractedMetadata = z.infer<typeof metadataSchema>

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

// Claude frequently wraps JSON output in markdown code fences (```json ... ``` or bare ``` ... ```)
// and/or surrounds it with prose. Strip fences first, then fall back to extracting the first
// balanced-looking {...} substring so we can still parse when there's leading/trailing text.
function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? text
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1)
  }
  return candidate
}

export async function extractMetadata(articleText: string): Promise<ExtractedMetadata> {
  const client = getClient()
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract metadata from this KB article as strict JSON with keys keywords (string[]), tags (string[]), summary (string), category (string). Article:\n\n${articleText}`,
    }],
  })
  const text = textOf(response)
  const jsonText = extractJsonText(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `extractMetadata: failed to parse Claude response as JSON: ${message}. Raw response: ${text.slice(0, 200)}`
    )
  }

  const result = metadataSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `extractMetadata: Claude response did not match expected shape: ${result.error.message}. Raw response: ${text.slice(0, 200)}`
    )
  }
  return result.data
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
