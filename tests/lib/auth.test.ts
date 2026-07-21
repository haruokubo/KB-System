import { describe, it, expect, vi, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { authorizeCredentials } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as users from '@/lib/users'
import type { Role, User } from '@/generated/prisma/client'

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/users', () => ({ verifyPassword: vi.fn() }))
vi.mock('bcrypt', () => ({ default: { compare: vi.fn(), hash: vi.fn() } }))

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

  it('runs a dummy bcrypt.compare when no user exists, to avoid a timing side-channel', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await authorizeCredentials({ email: 'nobody@b.com', password: 'pw' })
    expect(bcrypt.compare).toHaveBeenCalledTimes(1)
    expect(bcrypt.compare).toHaveBeenCalledWith('pw', expect.any(String))
    // verifyPassword (the real-user path) must not also run for a nonexistent user
    expect(users.verifyPassword).not.toHaveBeenCalled()
  })
})
