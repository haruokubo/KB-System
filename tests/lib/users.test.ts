import { describe, it, expect, vi, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { createUser, verifyPassword } from '@/lib/users'
import { prisma } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  prisma: { user: { create: vi.fn() } },
}))

describe('createUser', () => {
  afterEach(() => vi.clearAllMocks())

  it('hashes the generated temp password and stores mustResetPassword=true', async () => {
    const created = { id: '1', email: 'a@b.com', name: 'A', role: 'editor', passwordHash: 'x', mustResetPassword: true }
    ;(prisma.user.create as any).mockResolvedValue(created)

    const { user, tempPassword } = await createUser('a@b.com', 'A', 'editor')

    expect(user).toEqual(created)
    expect(tempPassword).toHaveLength(16)
    const [[arg]] = (prisma.user.create as any).mock.calls
    expect(await bcrypt.compare(tempPassword, arg.data.passwordHash)).toBe(true)
    expect(arg.data.mustResetPassword).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('returns true for a matching password', async () => {
    const hash = await bcrypt.hash('correct-horse', 12)
    expect(await verifyPassword('correct-horse', hash)).toBe(true)
  })

  it('returns false for a non-matching password', async () => {
    const hash = await bcrypt.hash('correct-horse', 12)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
