import { describe, it, expect, vi } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { extractMetadata, synthesizeAnswer } from '@/lib/claude'

describe('extractMetadata', () => {
  it('parses the JSON block returned by Claude', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"keywords":["outlook","ost"],"tags":["Exchange Online"],"summary":"Corrupt OST fix.","category":"Email"}' }],
    })
    const result = await extractMetadata('Outlook will not open due to corrupt OST cache.')
    expect(result).toEqual({
      keywords: ['outlook', 'ost'],
      tags: ['Exchange Online'],
      summary: 'Corrupt OST fix.',
      category: 'Email',
    })
  })

  it('parses a response wrapped in markdown code fences', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: 'Here is the metadata:\n```json\n{"keywords":["outlook","ost"],"tags":["Exchange Online"],"summary":"Corrupt OST fix.","category":"Email"}\n```',
      }],
    })
    const result = await extractMetadata('Outlook will not open due to corrupt OST cache.')
    expect(result).toEqual({
      keywords: ['outlook', 'ost'],
      tags: ['Exchange Online'],
      summary: 'Corrupt OST fix.',
      category: 'Email',
    })
  })

  it('throws a clear error when the response is malformed/non-JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I could not process that article.' }],
    })
    await expect(extractMetadata('some article')).rejects.toThrow(
      /extractMetadata: failed to parse Claude response as JSON/
    )
  })

  it('throws a clear error when the parsed JSON does not match the expected shape', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"keywords":["outlook"],"tags":["Exchange Online"],"summary":"Corrupt OST fix."}' }],
    })
    await expect(extractMetadata('some article')).rejects.toThrow(
      /extractMetadata: Claude response did not match expected shape/
    )
  })
})

describe('synthesizeAnswer', () => {
  it('passes retrieved chunks into the prompt and returns Claude text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Probable cause: corrupt OST. [KB-1]' }] })
    const result = await synthesizeAnswer('Outlook wont open', [
      { articleId: 'KB-1', text: 'Recreate the Outlook profile to fix a corrupt OST cache.' },
    ])
    expect(result).toContain('KB-1')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('KB-1') })]),
      })
    )
  })
})
