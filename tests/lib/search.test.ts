import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUploadDocuments = vi.fn().mockResolvedValue({})
const mockSearch = vi.fn()
const mockGetIndex = vi.fn()
const mockCreateIndex = vi.fn()
vi.mock('@azure/search-documents', () => ({
  SearchClient: class {
    uploadDocuments = mockUploadDocuments
    search = mockSearch
  },
  SearchIndexClient: class {
    getIndex = mockGetIndex
    createIndex = mockCreateIndex
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
  mockGetIndex.mockReset()
  mockCreateIndex.mockReset().mockResolvedValue({})
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
  it('creates the index with the id/articleId/section/text/vector schema when it does not exist yet', async () => {
    mockGetIndex.mockRejectedValue({ statusCode: 404 })

    await createIndexIfNotExists()

    expect(mockCreateIndex).toHaveBeenCalledTimes(1)
    expect(mockCreateIndex).toHaveBeenCalledWith({
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

  it('does not attempt to recreate the index when it already exists', async () => {
    mockGetIndex.mockResolvedValue({ name: 'kb-chunks', fields: [] })

    await expect(createIndexIfNotExists()).resolves.toBeUndefined()

    expect(mockGetIndex).toHaveBeenCalledWith('kb-chunks')
    expect(mockCreateIndex).not.toHaveBeenCalled()
  })

  it('propagates non-404 errors instead of treating them as "not found"', async () => {
    mockGetIndex.mockRejectedValue({ statusCode: 500, message: 'service unavailable' })

    await expect(createIndexIfNotExists()).rejects.toEqual({ statusCode: 500, message: 'service unavailable' })
    expect(mockCreateIndex).not.toHaveBeenCalled()
  })
})
