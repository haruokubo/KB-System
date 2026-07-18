import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST } from '@/app/api/users/reset-password/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import type { Role, User } from '@/generated/prisma/client'

vi.mock('@/lib/db', () => ({ prisma: { user: { update: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// `auth` from `@/lib/auth` is NextAuth's overloaded universal helper (route
// handler wrapper / middleware wrapper / plain session getter all in one
// intersection type). Our route only ever calls the zero-arg
// `() => Promise<Session | null>` overload, so narrow the mock to that
// signature rather than letting `vi.mocked` pick an unrelated overload
// (it otherwise infers the last, middleware-shaped one and rejects
// `mockResolvedValue` with a plain session object).
const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)

function fakeSession(userId: string) {
  return {
    user: {
      id: userId,
      email: 'a@b.com',
      name: 'A',
      role: 'editor' as Role,
      mustResetPassword: true,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

describe('POST /api/users/reset-password', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    mockedAuth.mockResolvedValue(null)
    const req = new Request('http://x/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'a-long-enough-password' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects passwords under 12 characters', async () => {
    mockedAuth.mockResolvedValue(fakeSession('1'))
    const req = new Request('http://x/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'short' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('updates the password hash and clears mustResetPassword when valid', async () => {
    mockedAuth.mockResolvedValue(fakeSession('1'))
    const updated: User = {
      id: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'editor' as Role,
      passwordHash: 'newhash',
      mustResetPassword: false,
      createdAt: new Date(),
    }
    vi.mocked(prisma.user.update).mockResolvedValue(updated)
    const req = new Request('http://x/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'a-long-enough-password' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: expect.objectContaining({ mustResetPassword: false }),
    })
  })
})
