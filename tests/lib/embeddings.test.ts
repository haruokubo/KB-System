import { describe, it, expect, vi } from 'vitest'

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockCreate }
  },
}))

import { embed } from '@/lib/embeddings'

describe('embed', () => {
  it('returns one vector per input text, in order', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com'
    process.env.AZURE_OPENAI_API_KEY = 'test-api-key'
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = 'text-embedding-3-large'
    mockCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
    })
    const result = await embed(['first', 'second'])
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]])
  })

  it('throws if the API returns fewer embeddings than texts requested', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com'
    process.env.AZURE_OPENAI_API_KEY = 'test-api-key'
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = 'text-embedding-3-large'
    mockCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2] }],
    })
    await expect(embed(['first', 'second'])).rejects.toThrow(
      'embed: expected 2 embeddings but received 1'
    )
  })

  it('reorders embeddings returned out of order back to input order', async () => {
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com'
    process.env.AZURE_OPENAI_API_KEY = 'test-api-key'
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT = 'text-embedding-3-large'
    mockCreate.mockResolvedValue({
      data: [
        { index: 1, embedding: [0.3, 0.4] },
        { index: 0, embedding: [0.1, 0.2] },
      ],
    })
    const result = await embed(['first', 'second'])
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]])
  })
})
