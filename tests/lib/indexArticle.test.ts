import { describe, it, expect, vi, afterEach } from 'vitest'
import { indexArticle } from '@/lib/indexArticle'
import * as embeddings from '@/lib/embeddings'
import * as search from '@/lib/search'

vi.mock('@/lib/embeddings', () => ({ embed: vi.fn() }))
vi.mock('@/lib/search', () => ({ indexChunks: vi.fn(), createIndexIfNotExists: vi.fn() }))

describe('indexArticle', () => {
  afterEach(() => vi.clearAllMocks())

  it('chunks the article, embeds each chunk, and indexes them with vectors attached', async () => {
    vi.mocked(embeddings.embed).mockResolvedValue([[0.1], [0.2]])

    await indexArticle({ id: 'a1', title: 'T', symptoms: 'crash', rootCause: 'ost', resolution: null, alternativeFixes: null })

    expect(embeddings.embed).toHaveBeenCalledWith(['crash', 'ost'])
    expect(search.indexChunks).toHaveBeenCalledWith([
      { id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1] },
      { id: 'a1-rootCause', articleId: 'a1', section: 'rootCause', text: 'ost', vector: [0.2] },
    ])
  })

  it('ensures the search index exists before indexing any chunks', async () => {
    vi.mocked(embeddings.embed).mockResolvedValue([[0.1], [0.2]])

    await indexArticle({ id: 'a1', title: 'T', symptoms: 'crash', rootCause: 'ost', resolution: null, alternativeFixes: null })

    expect(search.createIndexIfNotExists).toHaveBeenCalledTimes(1)
    const createOrder = vi.mocked(search.createIndexIfNotExists).mock.invocationCallOrder[0]
    const indexOrder = vi.mocked(search.indexChunks).mock.invocationCallOrder[0]
    if (createOrder === undefined || indexOrder === undefined) {
      throw new Error('expected both mocks to have recorded a call order')
    }
    expect(createOrder).toBeLessThan(indexOrder)
  })

  it('does not call embed, createIndexIfNotExists, or indexChunks when there is nothing to chunk', async () => {
    await indexArticle({ id: 'a1', title: 'T', symptoms: null, rootCause: null, resolution: null, alternativeFixes: null })

    expect(embeddings.embed).not.toHaveBeenCalled()
    expect(search.createIndexIfNotExists).not.toHaveBeenCalled()
    expect(search.indexChunks).not.toHaveBeenCalled()
  })
})
