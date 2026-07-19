import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUploadDocuments = vi.fn().mockResolvedValue({})
const mockSearch = vi.fn()
const mockCreateOrUpdateIndex = vi.fn()
vi.mock('@azure/search-documents', () => ({
  SearchClient: class {
    uploadDocuments = mockUploadDocuments
    search = mockSearch
  },
  SearchIndexClient: class {
    createOrUpdateIndex = mockCreateOrUpdateIndex
  },
  AzureKeyCredential: class {},
}))

import { indexChunks, hybridSearch, createIndexIfNotExists } from '@/lib/search'

beforeEach(() => {
  process.env.AZURE_SEARCH_ENDPOINT = 'https://test.search.windows.net'
  process.env.AZURE_SEARCH_API_KEY = 'test-api-key'
  process.env.AZURE_SEARCH_INDEX_NAME = 'kb-chunks'
  mockUploadDocuments.mockReset().mockResolvedValue({})
  mockSearch.mockReset()
  mockCreateOrUpdateIndex.mockReset().mockResolvedValue({})
})

describe('indexChunks', () => {
  it('uploads chunk documents with id/articleId/text/vector fields', async () => {
    await indexChunks([{ id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1, 0.2] }])
    expect(mockUploadDocuments).toHaveBeenCalledWith([
      { id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1, 0.2] },
    ])
  })

  it('throws if the service reports a per-document indexing failure', async () => {
    mockUploadDocuments.mockResolvedValue({
      results: [
        { key: 'a1-symptoms', succeeded: false, statusCode: 400, errorMessage: 'field vector: invalid dimension' },
      ],
    })
    await expect(
      indexChunks([{ id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1, 0.2] }])
    ).rejects.toThrow('indexChunks: 1 of 1 documents failed to index')
  })

  it('does not throw when all documents succeed', async () => {
    mockUploadDocuments.mockResolvedValue({
      results: [{ key: 'a1-symptoms', succeeded: true, statusCode: 200 }],
    })
    await expect(
      indexChunks([{ id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1, 0.2] }])
    ).resolves.toBeUndefined()
  })
})

describe('hybridSearch', () => {
  it('returns top results with articleId/text/score', async () => {
    mockSearch.mockResolvedValue({
      results: (async function* () {
        yield { document: { id: 'a1-symptoms', articleId: 'a1', text: 'crash' }, score: 0.9 }
      })(),
    })
    const results = await hybridSearch('outlook crash', [0.1, 0.2])
    expect(results).toEqual([{ articleId: 'a1', text: 'crash', score: 0.9 }])
  })
})

describe('createIndexIfNotExists', () => {
  it('creates or updates the index with the id/articleId/section/text/vector schema', async () => {
    await createIndexIfNotExists()

    expect(mockCreateOrUpdateIndex).toHaveBeenCalledTimes(1)
    expect(mockCreateOrUpdateIndex).toHaveBeenCalledWith({
      name: 'kb-chunks',
      fields: [
        { name: 'id', type: 'Edm.String', key: true, filterable: true },
        { name: 'articleId', type: 'Edm.String', filterable: true },
        { name: 'section', type: 'Edm.String', filterable: true },
        { name: 'text', type: 'Edm.String', searchable: true },
        {
          name: 'vector',
          type: 'Collection(Edm.Single)',
          searchable: true,
          vectorSearchDimensions: 3072,
          vectorSearchProfileName: 'kb-vector-profile',
        },
      ],
      vectorSearch: {
        algorithms: [{ name: 'kb-hnsw', kind: 'hnsw' }],
        profiles: [{ name: 'kb-vector-profile', algorithmConfigurationName: 'kb-hnsw' }],
      },
      semanticSearch: {
        defaultConfigurationName: 'kb-semantic-config',
        configurations: [
          { name: 'kb-semantic-config', prioritizedFields: { contentFields: [{ name: 'text' }] } },
        ],
      },
    })
  })

  it('is idempotent — calling it again when the index already exists still resolves', async () => {
    mockCreateOrUpdateIndex.mockResolvedValueOnce({ name: 'kb-chunks', fields: [] })

    await expect(createIndexIfNotExists()).resolves.toBeUndefined()
    await expect(createIndexIfNotExists()).resolves.toBeUndefined()

    expect(mockCreateOrUpdateIndex).toHaveBeenCalledTimes(2)
  })

  it('propagates errors from the service', async () => {
    mockCreateOrUpdateIndex.mockRejectedValue({ statusCode: 500, message: 'service unavailable' })

    await expect(createIndexIfNotExists()).rejects.toEqual({ statusCode: 500, message: 'service unavailable' })
  })
})
