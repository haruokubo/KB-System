import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/users'
import { authConfig } from '@/lib/auth.config'

export async function authorizeCredentials(creds: { email: string; password: string } | undefined) {
  if (!creds?.email || !creds.password) return null
  const dbUser = await prisma.user.findUnique({ where: { email: creds.email } })
  if (!dbUser) return null
  const valid = await verifyPassword(creds.password, dbUser.passwordHash)
  if (!valid) return null
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
