import { describe, it, expect, vi, afterEach } from 'vitest'
import * as embeddings from '@/lib/embeddings'
import * as search from '@/lib/search'
import * as claude from '@/lib/claude'

vi.mock('@/lib/embeddings', () => ({ embed: vi.fn() }))
vi.mock('@/lib/search', () => ({ hybridSearch: vi.fn() }))
vi.mock('@/lib/claude', () => ({ synthesizeAnswer: vi.fn() }))

import { getAnswer } from '@/lib/ragAnswer'

describe('getAnswer', () => {
  afterEach(() => vi.clearAllMocks())

  it('embeds the query, retrieves chunks, and synthesizes an answer from them', async () => {
    vi.mocked(embeddings.embed).mockResolvedValue([[0.1, 0.2]])
    vi.mocked(search.hybridSearch).mockResolvedValue([{ articleId: 'a1', text: 'crash', score: 0.9 }])
    vi.mocked(claude.synthesizeAnswer).mockResolvedValue('Probable cause: X [a1]')

    const result = await getAnswer('outlook crash')

    expect(embeddings.embed).toHaveBeenCalledWith(['outlook crash'])
    expect(search.hybridSearch).toHaveBeenCalledWith('outlook crash', [0.1, 0.2])
    expect(claude.synthesizeAnswer).toHaveBeenCalledWith('outlook crash', [{ articleId: 'a1', text: 'crash' }])
    expect(result).toEqual({ answer: 'Probable cause: X [a1]', results: [{ articleId: 'a1', text: 'crash', score: 0.9 }] })
  })

  it('throws instead of searching/synthesizing when embed returns no vector', async () => {
    vi.mocked(embeddings.embed).mockResolvedValue([])

    await expect(getAnswer('outlook crash')).rejects.toThrow('getAnswer: embed returned no vector for the query')
    expect(search.hybridSearch).not.toHaveBeenCalled()
    expect(claude.synthesizeAnswer).not.toHaveBeenCalled()
  })
})
