import { describe, it, expect } from 'vitest'
import { authConfig } from '@/lib/auth.config'
import type { Role } from '@/generated/prisma/client'

describe('authConfig', () => {
  it('trusts the request host, since this app deploys to a self-hosted target (Azure App Service), not an auto-detected platform like Vercel', () => {
    expect(authConfig.trustHost).toBe(true)
  })
})

describe('authConfig callbacks', () => {
  it('jwt callback copies id/role/mustResetPassword from the sign-in user onto the token', () => {
    const token = authConfig.callbacks.jwt({
      token: {},
      user: { id: 'u1', role: 'admin' as Role, mustResetPassword: true },
    } as Parameters<typeof authConfig.callbacks.jwt>[0])

    expect(token).toMatchObject({ id: 'u1', role: 'admin', mustResetPassword: true })
  })

  it('jwt callback leaves an existing token unchanged when no user is present (session refresh)', () => {
    const existing = { id: 'u1', role: 'editor' as Role, mustResetPassword: false }
    const token = authConfig.callbacks.jwt({
      token: existing,
      user: undefined,
    } as unknown as Parameters<typeof authConfig.callbacks.jwt>[0])

    expect(token).toBe(existing)
  })

  it('session callback copies id/role/mustResetPassword from the token onto session.user', () => {
    const session = authConfig.callbacks.session({
      session: { user: {}, expires: '2099-01-01T00:00:00.000Z' },
      token: { id: 'u1', role: 'editor' as Role, mustResetPassword: true },
    } as unknown as Parameters<typeof authConfig.callbacks.session>[0])

    expect(session.user).toMatchObject({ id: 'u1', role: 'editor', mustResetPassword: true })
  })
})
