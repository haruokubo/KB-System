import bcrypt from 'bcrypt'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/users'
import { authConfig } from '@/lib/auth.config'
import { logAuditEvent } from '@/lib/logger'

// Precomputed bcrypt hash (cost 12) of a fixed dummy password. When no user
// exists for the submitted email, we still run a bcrypt.compare against this
// hash before returning, so that the "no such account" path takes comparable
// time to the "wrong password for a real account" path (which always incurs
// a bcrypt.compare against dbUser.passwordHash). Without this, an attacker
// could measure response time to enumerate valid email addresses.
const DUMMY_PASSWORD_HASH = '$2b$12$vESm8BEFRsjrgxhBkMvuvOhOj6UBaqtzHZesa0bSS88YrAATq73ZC'

export async function authorizeCredentials(creds: { email: string; password: string } | undefined) {
  if (!creds?.email || !creds.password) return null
  const dbUser = await prisma.user.findUnique({ where: { email: creds.email } })
  if (!dbUser) {
    await bcrypt.compare(creds.password, DUMMY_PASSWORD_HASH)
    logAuditEvent('auth.login_failure', { email: creds.email })
    return null
  }
  const valid = await verifyPassword(creds.password, dbUser.passwordHash)
  if (!valid) {
    logAuditEvent('auth.login_failure', { email: creds.email })
    return null
  }
  logAuditEvent('auth.login_success', { email: creds.email })
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    mustResetPassword: dbUser.mustResetPassword,
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (credentials) => {
        const email = typeof credentials?.email === 'string' ? credentials.email : undefined
        const password = typeof credentials?.password === 'string' ? credentials.password : undefined
        return authorizeCredentials(email && password ? { email, password } : undefined)
      },
    }),
  ],
})
