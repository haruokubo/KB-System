import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NewArticlePage from '@/app/(dashboard)/articles/new/page'

// next@16's `useRouter` throws "invariant expected app router to be mounted"
// when rendered outside a real App Router tree (as in jsdom unit tests) —
// mock it so the component can call `router.push` after a successful save.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('NewArticlePage', () => {
  it('submits the form to POST /api/articles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a1' }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewArticlePage />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Outlook credential loop' } })
    fireEvent.click(screen.getByText('Save draft'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/articles', expect.objectContaining({ method: 'POST' })))
  })
})
