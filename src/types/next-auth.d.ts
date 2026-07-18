import type { DefaultSession } from '@auth/core/types'
import type { Role } from '@/generated/prisma/client'

// NextAuth v5 (next-auth@5.0.0-beta.31) re-exports its `Session`/`User` types
// from `@auth/core/types` via `export type { ... } from '@auth/core/types'`.
// That form of re-export does not participate in declaration merging, so
// augmenting `declare module 'next-auth' { interface Session {...} }` is
// silently ignored — confirmed by `npx tsc --noEmit` still reporting
// `user.role` as `unknown` even with that augmentation in place. The
// interfaces are actually declared in `@auth/core/types`, so that is the
// module we must augment for the merge to take effect everywhere
// (including through the `next-auth` re-export, since it's the same
// underlying interface identity).
declare module '@auth/core/types' {
  interface User {
    role: Role
    mustResetPassword: boolean
  }

  interface Session {
    user: {
      role: Role
      mustResetPassword: boolean
    } & DefaultSession['user']
  }
}

// `next-auth/jwt` re-exports `@auth/core/jwt` via `export *`, which (unlike
// the named `export type { ... }` re-export above) does participate in
// declaration merging, so augmenting it here works. Augmenting the true
// source module directly for consistency with the fix above.
declare module '@auth/core/jwt' {
  interface JWT {
    role: Role
    mustResetPassword: boolean
  }
}
