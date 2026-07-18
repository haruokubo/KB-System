export interface Chunk {
  id: string
  articleId: string
  section: string
  text: string
}

interface ChunkableArticle {
  id: string
  title: string
  symptoms?: string | null
  rootCause?: string | null
  resolution?: string | null
  alternativeFixes?: string | null
}

const SECTIONS = ['symptoms', 'rootCause', 'resolution', 'alternativeFixes'] as const

export function chunkArticle(article: ChunkableArticle): Chunk[] {
  const chunks: Chunk[] = []
  for (const section of SECTIONS) {
    const text = article[section]
    if (text) {
      chunks.push({ id: `${article.id}-${section}`, articleId: article.id, section, text })
    }
  }
  return chunks
}
