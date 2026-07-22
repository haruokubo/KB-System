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
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/clients') {
        return Promise.resolve({ ok: true, json: async () => [{ id: 'c1', name: 'Exalt Health' }] })
      }
      if (url === '/api/tools') {
        return Promise.resolve({ ok: true, json: async () => [{ id: 't1', name: 'Sonicwall' }] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'a1' }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewArticlePage />)
    await waitFor(() => expect(screen.getByLabelText('Sonicwall')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Outlook credential loop' } })
    fireEvent.click(screen.getByText('Save draft'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/articles', expect.objectContaining({ method: 'POST' })))
  })

  it('fetches clients and tools on mount and includes selections in the POST body', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>((url) => {
      if (url === '/api/clients') {
        return Promise.resolve({ ok: true, json: async () => [{ id: 'c1', name: 'Exalt Health' }] })
      }
      if (url === '/api/tools') {
        return Promise.resolve({ ok: true, json: async () => [{ id: 't1', name: 'Sonicwall' }] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'a1' }) })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewArticlePage />)
    await waitFor(() => expect(screen.getByLabelText('Sonicwall')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Outlook credential loop' } })
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'Exalt Health' } })
    fireEvent.click(screen.getByLabelText('Sonicwall'))
    fireEvent.click(screen.getByText('Save draft'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/articles', expect.objectContaining({ method: 'POST' })))
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/articles')
    const options = call?.[1]
    if (!options?.body || typeof options.body !== 'string') {
      throw new Error('expected the /api/articles call to include a string body')
    }
    const body: unknown = JSON.parse(options.body)
    expect(body).toEqual(expect.objectContaining({ client: 'Exalt Health', tools: ['Sonicwall'] }))
  })
})
