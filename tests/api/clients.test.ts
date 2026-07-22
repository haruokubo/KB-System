import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from '@/app/api/clients/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

vi.mock('@/lib/db', () => ({
  prisma: { client: { findMany: vi.fn() } },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// See tests/api/reset-password.test.ts for why `auth` must be narrowed to its
// zero-arg `() => Promise<Session | null>` overload before mocking.
const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)

function fakeSession(role: Session['user']['role']): Session {
  return {
    user: { id: '1', email: 'a@b.com', name: 'A', role, mustResetPassword: false },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

describe('GET /api/clients', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    mockedAuth.mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/clients'))
    expect(res.status).toBe(401)
  })

  it('returns clients sorted by name for any authenticated role', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    vi.mocked(prisma.client.findMany).mockResolvedValue([
      { id: 'c1', name: 'Catchall' },
      { id: 'c2', name: 'Exalt Health' },
    ])
    const res = await GET(new Request('http://x/api/clients'))
    expect(res.status).toBe(200)
    expect(prisma.client.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    const body: unknown = await res.json()
    expect(body).toEqual([
      { id: 'c1', name: 'Catchall' },
      { id: 'c2', name: 'Exalt Health' },
    ])
  })
})
