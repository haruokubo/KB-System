import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SearchPage from '@/app/(dashboard)/search/page'

describe('SearchPage', () => {
  it('shows the AI answer above the cited article list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'Probable cause: corrupt OST [a1]', results: [{ articleId: 'a1', text: 'Recreate profile', score: 0.9 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<SearchPage />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'outlook crash' } })
    fireEvent.click(screen.getByText('Search'))

    await waitFor(() => expect(screen.getByText(/Probable cause/)).toBeInTheDocument())
    expect(screen.getByText('Recreate profile')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=outlook+crash')
  })
})
