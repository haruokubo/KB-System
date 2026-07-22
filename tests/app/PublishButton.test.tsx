import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PublishButton } from '@/app/(dashboard)/articles/[id]/PublishButton'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

describe('PublishButton', () => {
  it('calls POST /api/articles/:id/publish and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<PublishButton articleId="a1" />)
    fireEvent.click(screen.getByText('Publish'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/articles/a1/publish', { method: 'POST' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows an error message and does not refresh on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) })
    vi.stubGlobal('fetch', fetchMock)
    refresh.mockClear()

    render(<PublishButton articleId="a1" />)
    fireEvent.click(screen.getByText('Publish'))

    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument())
    expect(refresh).not.toHaveBeenCalled()
  })
})
