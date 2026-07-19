import { SearchClient, SearchIndexClient, AzureKeyCredential, type SearchIndex } from '@azure/search-documents'

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

// text-embedding-3-large's default (non-truncated) output dimensionality — see src/lib/embeddings.ts,
// which does not pass a `dimensions` override, so every vector indexed/queried is this width.
const VECTOR_DIMENSIONS = 3072
const VECTOR_ALGORITHM_NAME = 'kb-hnsw'
const VECTOR_PROFILE_NAME = 'kb-vector-profile'
const SEMANTIC_CONFIG_NAME = 'kb-semantic-config'

function getClient(): SearchClient<IndexEntry> {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT
  const apiKey = process.env.AZURE_SEARCH_API_KEY
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME
  if (!endpoint || !apiKey || !indexName) throw new Error('Azure AI Search env vars not set')
  return new SearchClient<IndexEntry>(endpoint, indexName, new AzureKeyCredential(apiKey))
}

function getIndexClient(): { client: SearchIndexClient; indexName: string } {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT
  const apiKey = process.env.AZURE_SEARCH_API_KEY
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME
  if (!endpoint || !apiKey || !indexName) throw new Error('Azure AI Search env vars not set')
  return { client: new SearchIndexClient(endpoint, new AzureKeyCredential(apiKey)), indexName }
}

function buildIndexSchema(indexName: string): SearchIndex {
  return {
    name: indexName,
    fields: [
      { name: 'id', type: 'Edm.String', key: true, filterable: true },
      { name: 'articleId', type: 'Edm.String', filterable: true },
      { name: 'section', type: 'Edm.String', filterable: true },
      { name: 'text', type: 'Edm.String', searchable: true },
      {
        name: 'vector',
        type: 'Collection(Edm.Single)',
        searchable: true,
        vectorSearchDimensions: VECTOR_DIMENSIONS,
        vectorSearchProfileName: VECTOR_PROFILE_NAME,
      },
    ],
    vectorSearch: {
      algorithms: [{ name: VECTOR_ALGORITHM_NAME, kind: 'hnsw' }],
      profiles: [{ name: VECTOR_PROFILE_NAME, algorithmConfigurationName: VECTOR_ALGORITHM_NAME }],
    },
    // `hybridSearch`'s `queryType: 'semantic'` throws at query time if the index has a semantic
    // configuration but no `defaultConfigurationName` — set it explicitly so callers never have to
    // pass a configuration name on every query.
    semanticSearch: {
      defaultConfigurationName: SEMANTIC_CONFIG_NAME,
      configurations: [
        {
          name: SEMANTIC_CONFIG_NAME,
          prioritizedFields: { contentFields: [{ name: 'text' }] },
        },
      ],
    },
  }
}

export async function createIndexIfNotExists(): Promise<void> {
  const { client, indexName } = getIndexClient()
  // `createOrUpdateIndex` is an atomic upsert (PUT semantics) on the Azure AI Search service —
  // unlike a check-then-act getIndex()/createIndex() pair, it has no race window when concurrent
  // cold starts call this at the same time.
  await client.createOrUpdateIndex(buildIndexSchema(indexName))
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
