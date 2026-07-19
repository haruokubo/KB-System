import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUploadDocuments = vi.fn().mockResolvedValue({})
const mockSearch = vi.fn()
vi.mock('@azure/search-documents', () => ({
  SearchClient: class {
    uploadDocuments = mockUploadDocuments
    search = mockSearch
  },
  AzureKeyCredential: class {},
}))

import { indexChunks, hybridSearch } from '@/lib/search'

beforeEach(() => {
  process.env.AZURE_SEARCH_ENDPOINT = 'https://test.search.windows.net'
  process.env.AZURE_SEARCH_API_KEY = 'test-api-key'
  process.env.AZURE_SEARCH_INDEX_NAME = 'kb-chunks'
  mockUploadDocuments.mockReset().mockResolvedValue({})
  mockSearch.mockReset()
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
