import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from '@/app/api/search/route'
import { auth } from '@/lib/auth'
import * as ragAnswer from '@/lib/ragAnswer'
import type { Session } from 'next-auth'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ragAnswer', () => ({ getAnswer: vi.fn() }))

// See tests/api/reset-password.test.ts for why `auth` must be narrowed to its
// zero-arg `() => Promise<Session | null>` overload before mocking.
const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)

function fakeSession(): Session {
  return {
    user: { id: '1', email: 'a@b.com', name: 'A', role: 'read_only', mustResetPassword: false },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

describe('GET /api/search', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    mockedAuth.mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/search?q=outlook+crash'))
    expect(res.status).toBe(401)
  })

  it('requires a q parameter', async () => {
    mockedAuth.mockResolvedValue(fakeSession())
    const res = await GET(new Request('http://x/api/search'))
    expect(res.status).toBe(400)
  })

  it('returns the RAG answer and results', async () => {
    mockedAuth.mockResolvedValue(fakeSession())
    vi.mocked(ragAnswer.getAnswer).mockResolvedValue({ answer: 'ans', results: [] })
    const res = await GET(new Request('http://x/api/search?q=outlook+crash'))
    const body: unknown = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ answer: 'ans', results: [] })
    expect(ragAnswer.getAnswer).toHaveBeenCalledWith('outlook crash')
  })
})
