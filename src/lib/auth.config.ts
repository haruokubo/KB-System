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
        // `user.id` is only present on the object authorize() returns at
        // sign-in — token.sub also carries it by NextAuth convention, but
        // we set it explicitly here since this custom callback replaces
        // (not merges with) the default jwt callback.
        token.id = user.id as string
        token.role = user.role
        token.mustResetPassword = user.mustResetPassword
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.mustResetPassword = token.mustResetPassword
      return session
    },
  },
} satisfies NextAuthConfig
