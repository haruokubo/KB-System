import { chunkArticle } from '@/lib/chunk'
import { embed } from '@/lib/embeddings'
import { createIndexIfNotExists, indexChunks } from '@/lib/search'

interface ArticleForIndexing {
  id: string
  title: string
  symptoms?: string | null
  rootCause?: string | null
  resolution?: string | null
  alternativeFixes?: string | null
}

export async function indexArticle(article: ArticleForIndexing): Promise<void> {
  const chunks = chunkArticle(article)
  if (chunks.length === 0) return
  // The Azure AI Search index must exist before we can upload documents to it. This is the
  // only pipeline that writes to the index, so this is the one place that needs to ensure it —
  // idempotent (no-ops once the index has been created by an earlier run).
  await createIndexIfNotExists()
  const vectors = await embed(chunks.map((c) => c.text))
  const entries = chunks.map((chunk, i) => {
    const vector = vectors[i]
    // `embed` guarantees one vector per input text (it throws on a length mismatch), so this
    // only guards against that contract breaking — not expected to trigger in normal operation.
    if (!vector) {
      throw new Error(`indexArticle: missing embedding vector for chunk ${chunk.id}`)
    }
    return { ...chunk, vector }
  })
  await indexChunks(entries)
}
