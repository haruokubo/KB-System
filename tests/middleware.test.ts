import { describe, it, expect, vi } from 'vitest'
import { canAccess } from '@/proxy'

// `src/proxy.ts` builds its exported default via `auth(function proxy(req) {...})`,
// where `auth` comes from `NextAuth(authConfig)`. NextAuth's real `auth()` HOC
// decodes the session from cookies on the incoming request, which we can't
// fabricate in a unit test. Since what we actually want to verify here is our
// own routing/RBAC logic (not NextAuth's session-decoding, which is a trusted
// library feature), stub `next-auth` so its HOC passes the request straight
// through to our handler with `req.auth` set to whatever the test provides.
vi.mock('next-auth', () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}))

describe('canAccess', () => {
  it('allows editor to write articles', () => {
    expect(canAccess('editor', '/api/articles', 'POST')).toBe(true)
  })
  it('blocks read_only from writing articles', () => {
    expect(canAccess('read_only', '/api/articles', 'POST')).toBe(false)
  })
  it('allows read_only to read articles', () => {
    expect(canAccess('read_only', '/api/articles', 'GET')).toBe(true)
  })
  it('blocks editor from user management', () => {
    expect(canAccess('editor', '/api/users', 'POST')).toBe(false)
  })
  it('allows admin everything', () => {
    expect(canAccess('admin', '/api/users', 'POST')).toBe(true)
  })
  it('allows editor to self-service reset their password', () => {
    expect(canAccess('editor', '/api/users/reset-password', 'POST')).toBe(true)
  })
  it('allows read_only to self-service reset their password', () => {
    expect(canAccess('read_only', '/api/users/reset-password', 'POST')).toBe(true)
  })
  it('blocks editor from other user-management paths', () => {
    expect(canAccess('editor', '/api/users', 'POST')).toBe(false)
    expect(canAccess('editor', '/api/users/some-id', 'GET')).toBe(false)
  })
  it('blocks read_only from other user-management paths', () => {
    expect(canAccess('read_only', '/api/users', 'POST')).toBe(false)
    expect(canAccess('read_only', '/api/users/some-id', 'GET')).toBe(false)
  })
  it('allows editor to view the article page routes', () => {
    expect(canAccess('editor', '/articles/new', 'GET')).toBe(true)
    expect(canAccess('editor', '/articles/some-id', 'GET')).toBe(true)
  })
  it('allows read_only to view the article page routes', () => {
    expect(canAccess('read_only', '/articles/new', 'GET')).toBe(true)
    expect(canAccess('read_only', '/articles/some-id', 'GET')).toBe(true)
  })
  it('allows editor and read_only to view the search page route', () => {
    expect(canAccess('editor', '/search', 'GET')).toBe(true)
    expect(canAccess('read_only', '/search', 'GET')).toBe(true)
  })
  it('allows any authenticated role to view the home page route', () => {
    expect(canAccess('admin', '/', 'GET')).toBe(true)
    expect(canAccess('editor', '/', 'GET')).toBe(true)
    expect(canAccess('read_only', '/', 'GET')).toBe(true)
  })
})

describe('proxy default export (home page route)', () => {
  type Role = 'admin' | 'editor' | 'read_only'

  async function callProxy(role: Role | null) {
    const { default: proxy } = await import('@/proxy')
    const req = {
      auth: role ? { user: { role } } : null,
      url: 'http://localhost/',
      nextUrl: { pathname: '/' },
      method: 'GET',
    } as unknown as Parameters<typeof proxy>[0]
    const event = {} as unknown as Parameters<typeof proxy>[1]
    return proxy(req, event)
  }

  it('redirects an unauthenticated request to / to /login', async () => {
    const res = await callProxy(null)
    expect(res?.status).toBe(307)
    expect(res?.headers.get('location')).toBe('http://localhost/login')
  })

  it('allows an authenticated admin to GET /', async () => {
    const res = await callProxy('admin')
    expect(res?.status).not.toBe(307)
    expect(res?.status).not.toBe(403)
  })

  it('allows an authenticated editor to GET /', async () => {
    const res = await callProxy('editor')
    expect(res?.status).not.toBe(307)
    expect(res?.status).not.toBe(403)
  })

  it('allows an authenticated read_only user to GET /', async () => {
    const res = await callProxy('read_only')
    expect(res?.status).not.toBe(307)
    expect(res?.status).not.toBe(403)
  })
})
