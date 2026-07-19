import { embed } from '@/lib/embeddings'
import { hybridSearch, type SearchResult } from '@/lib/search'
import { synthesizeAnswer } from '@/lib/claude'

export async function getAnswer(query: string): Promise<{ answer: string; results: SearchResult[] }> {
  const [queryVector] = await embed([query])
  if (!queryVector) throw new Error('getAnswer: embed returned no vector for the query')
  const results = await hybridSearch(query, queryVector)
  const answer = await synthesizeAnswer(query, results.map((r) => ({ articleId: r.articleId, text: r.text })))
  return { answer, results }
}
