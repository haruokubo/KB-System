import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe NextAuth config: no providers that touch Node.js-only APIs
 * (e.g. the Credentials provider's Prisma-backed authorize function).
 * Consumed directly by `src/proxy.ts` (which runs on the Edge Runtime)
 * and spread into the full config in `src/lib/auth.ts` (which runs in
 * Node.js route handlers and can safely add the Credentials provider).
 */
export const authConfig = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.mustResetPassword = user.mustResetPassword
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role
      session.user.mustResetPassword = token.mustResetPassword
      return session
    },
  },
} satisfies NextAuthConfig
