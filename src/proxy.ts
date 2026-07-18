import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'
import type { Role } from '@/generated/prisma/client'

// Proxy (formerly "middleware") still runs on the Edge Runtime by default,
// so it must not pull in `@/lib/auth` (whose Credentials provider imports
// the Prisma client, which uses Node.js-only APIs). Build a separate,
// edge-safe NextAuth instance here from the shared, provider-less
// `authConfig` — it only needs to decode the session JWT already issued by
// the Node.js-side config, not run authorize.
const { auth } = NextAuth(authConfig)

export function canAccess(role: Role, path: string, method: string): boolean {
  if (role === 'admin') return true
  // Self-service password reset: every authenticated role must be able to
  // complete a forced reset on first login, even though the rest of
  // /api/users/* (admin-only user management) stays restricted below.
  if (path === '/api/users/reset-password' && method === 'POST') return true
  if (path.startsWith('/api/users')) return false
  if (path.startsWith('/api/articles')) {
    if (method === 'GET') return true
    return role === 'editor'
  }
  if (path.startsWith('/api/search')) return method === 'GET'
  return false
}

export default auth(function proxy(req) {
  const role = req.auth?.user?.role
  if (!role) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (!canAccess(role, req.nextUrl.pathname, req.method)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/api/articles/:path*', '/api/users/:path*', '/api/search/:path*', '/articles/:path*', '/search'],
}
