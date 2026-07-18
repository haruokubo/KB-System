import { describe, it, expect } from 'vitest'
import { chunkArticle } from '@/lib/chunk'

describe('chunkArticle', () => {
  it('produces one chunk per non-empty section, tagged with section name', () => {
    const chunks = chunkArticle({
      id: 'a1',
      title: 'Outlook wont open',
      symptoms: 'Outlook crashes on launch.',
      rootCause: 'Corrupt OST cache.',
      resolution: 'Recreate the Outlook profile.',
      alternativeFixes: null,
    })
    expect(chunks).toEqual([
      { id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'Outlook crashes on launch.' },
      { id: 'a1-rootCause', articleId: 'a1', section: 'rootCause', text: 'Corrupt OST cache.' },
      { id: 'a1-resolution', articleId: 'a1', section: 'resolution', text: 'Recreate the Outlook profile.' },
    ])
  })

  it('skips null/empty sections', () => {
    const chunks = chunkArticle({ id: 'a2', title: 'T', symptoms: '', rootCause: null, resolution: 'Fix.' })
    expect(chunks).toEqual([{ id: 'a2-resolution', articleId: 'a2', section: 'resolution', text: 'Fix.' }])
  })
})
