import { describe, it, expect, vi, afterEach } from 'vitest'
import { authorizeCredentials } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as users from '@/lib/users'
import type { Role, User } from '@/generated/prisma/client'

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/users', () => ({ verifyPassword: vi.fn() }))

describe('authorizeCredentials', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns the user object when credentials are valid', async () => {
    const dbUser: User = {
      id: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'editor' as Role,
      passwordHash: 'h',
      mustResetPassword: false,
      createdAt: new Date(),
    }
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser)
    vi.mocked(users.verifyPassword).mockResolvedValue(true)

    const result = await authorizeCredentials({ email: 'a@b.com', password: 'pw' })

    expect(result).toEqual({ id: '1', email: 'a@b.com', name: 'A', role: 'editor', mustResetPassword: false })
  })

  it('returns null when password is wrong', async () => {
    const dbUser: User = {
      id: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'editor' as Role,
      passwordHash: 'h',
      mustResetPassword: false,
      createdAt: new Date(),
    }
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser)
    vi.mocked(users.verifyPassword).mockResolvedValue(false)

    expect(await authorizeCredentials({ email: 'a@b.com', password: 'wrong' })).toBeNull()
  })

  it('returns null when no user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    expect(await authorizeCredentials({ email: 'nobody@b.com', password: 'pw' })).toBeNull()
  })
})
