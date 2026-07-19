import { SearchClient, AzureKeyCredential } from '@azure/search-documents'

export interface IndexEntry {
  id: string
  articleId: string
  section: string
  text: string
  vector: number[]
}

export interface SearchResult {
  articleId: string
  text: string
  score: number
}

function getClient(): SearchClient<IndexEntry> {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT
  const apiKey = process.env.AZURE_SEARCH_API_KEY
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME
  if (!endpoint || !apiKey || !indexName) throw new Error('Azure AI Search env vars not set')
  return new SearchClient<IndexEntry>(endpoint, indexName, new AzureKeyCredential(apiKey))
}

export async function indexChunks(entries: IndexEntry[]): Promise<void> {
  const client = getClient()
  const response = await client.uploadDocuments(entries)
  // Azure AI Search returns HTTP 200 for the batch call even when individual documents
  // fail validation (e.g. bad key, dimension mismatch) — per-document outcome is only
  // visible in `results[].succeeded`. Surface those failures instead of reporting success.
  const failures = (response.results ?? []).filter((r) => !r.succeeded)
  if (failures.length > 0) {
    const detail = failures.map((f) => `${f.key} (${f.errorMessage ?? f.statusCode})`).join('; ')
    throw new Error(`indexChunks: ${failures.length} of ${entries.length} documents failed to index: ${detail}`)
  }
}

export async function hybridSearch(query: string, queryVector: number[]): Promise<SearchResult[]> {
  const client = getClient()
  const response = await client.search(query, {
    vectorSearchOptions: { queries: [{ kind: 'vector', vector: queryVector, fields: ['vector'], kNearestNeighborsCount: 10 }] },
    queryType: 'semantic',
    semanticSearchOptions: {},
    top: 10,
  })
  const results: SearchResult[] = []
  for await (const r of response.results) {
    results.push({ articleId: r.document.articleId, text: r.document.text, score: r.score ?? 0 })
  }
  return results
}
