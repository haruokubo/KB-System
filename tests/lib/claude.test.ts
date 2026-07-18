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
