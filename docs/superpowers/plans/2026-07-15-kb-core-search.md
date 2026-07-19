# KB Core + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app where L2/L3 engineers author KB articles and get AI-synthesized troubleshooting answers (with cited source articles) from a single search box.

**Architecture:** Next.js 15 (App Router, TS) monolith — API routes are the backend. Azure Postgres Flexible (Prisma ORM) for article/user metadata. Azure Blob Storage for attachments. Azure AI Search for hybrid (keyword + semantic + vector) retrieval. Azure OpenAI for embeddings only. Claude (Anthropic SDK) for RAG answer synthesis and auto-tagging. NextAuth (Auth.js v5) credentials-based auth with 3-tier RBAC.

**Tech Stack:** Next.js 15, TypeScript (strict), Tailwind CSS, ShadCN, Prisma, NextAuth v5, Zod, Vitest + Testing Library, `@azure/storage-blob`, `@azure/search-documents`, `openai` SDK (pointed at Azure OpenAI endpoint), `@anthropic-ai/sdk`, bcrypt.

## Global Constraints

- Node.js: current LTS at scaffold time (verify against endoflife.date before pinning — do not assume a specific version number is still current).
- TypeScript: `strict: true` in `tsconfig.json`, no `any` in new code.
- Region: all Azure resources in `southcentralUS`.
- Resource naming: `rg-kbplatform-pilot` resource group; every resource tagged `owner`, `project=kb-platform`, `env=pilot`.
- Secrets: never committed, never placed in `.env` files checked into git. Local dev uses `.env.local` (gitignored) populated by the engineer from Key Vault via CLI, never pasted in by an assistant. Production uses Key Vault references in App Service settings.
- RBAC: 3 tiers only for this sub-project — `admin`, `editor`, `read_only`. Do not build the full 6-role model.
- No OCR, no SharePoint/OneDrive/Teams ingestion, no ticket DB, no script repo, no dashboards, no Neo4j — out of scope per spec.
- Every external call (Blob, Search, Azure OpenAI, Claude) goes through a thin wrapper in `src/lib/` — no raw SDK calls from route handlers or components.
- Application Insights wired in from Task 16 onward; do not ship without it.

---

## File Structure

```
kb-system/
  prisma/
    schema.prisma
    seed.ts
  src/
    lib/
      db.ts                 # Prisma client singleton
      auth.ts                # NextAuth config
      users.ts               # user creation/invite/password logic
      blob.ts                 # Azure Blob wrapper
      claude.ts               # Anthropic client wrapper
      embeddings.ts            # Azure OpenAI embeddings wrapper
      chunk.ts                 # article chunking
      search.ts                # Azure AI Search wrapper
      indexArticle.ts           # chunk -> embed -> index pipeline
      ragAnswer.ts               # retrieval + Claude synthesis
      articleSchema.ts            # Zod schemas shared by API + form
    app/
      login/page.tsx
      reset-password/page.tsx
      (dashboard)/
        layout.tsx               # RBAC-gated layout
        articles/
          new/page.tsx
          [id]/page.tsx
        search/page.tsx
      api/
        auth/[...nextauth]/route.ts
        users/route.ts
        articles/route.ts
        articles/[id]/route.ts
        articles/[id]/publish/route.ts
        search/route.ts
    middleware.ts
  tests/
    lib/*.test.ts
    api/*.test.ts
  .github/workflows/ci.yml
  infra/
    create-resources.sh
  .env.example
  README.md
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.gitignore`, `.env.example`, `README.md`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces: a running Next.js dev server at `localhost:3000`, `npm run dev` / `npm run build` / `npm run test` / `npm run lint` scripts.

- [ ] **Step 1: Scaffold Next.js app**

Run: `npx create-next-app@latest kb-system --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"`

Confirm the generated `package.json` `next` version — record it in this plan's Task 1 notes as the pinned version (do not silently drift).

- [ ] **Step 2: Add ShadCN**

Run (inside `kb-system/`): `npx shadcn@latest init -d`

- [ ] **Step 3: Enable TypeScript strict mode**

Edit `tsconfig.json`, confirm/set:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 4: Add test tooling**

Run: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react`

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 5: Write a smoke test**

Create `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run test suite to verify tooling works**

Run: `npm test`
Expected: 1 passed

- [ ] **Step 7: Create `.env.example`**

```
DATABASE_URL="postgresql://user:password@localhost:5432/kbsystem"
AZURE_STORAGE_CONNECTION_STRING=""
AZURE_SEARCH_ENDPOINT=""
AZURE_SEARCH_API_KEY=""
AZURE_SEARCH_INDEX_NAME="kb-articles"
AZURE_OPENAI_ENDPOINT=""
AZURE_OPENAI_API_KEY=""
AZURE_OPENAI_EMBEDDING_DEPLOYMENT="text-embedding-3-large"
ANTHROPIC_API_KEY=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 8: Write README setup section**

Add to `README.md`:

```markdown
# KB System

Internal KB + AI-assisted search for L2/L3 support engineers.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local`, fill values from Key Vault (never paste secrets from chat/docs).
3. `npm run db:migrate` (see Task 2)
4. `npm run dev`

## Test
`npm test`
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript, Tailwind, ShadCN, Vitest"
```

---

### Task 2: Database Schema + Prisma Client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `prisma/seed.ts`
- Test: `tests/lib/db.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var (Task 1 `.env.example`).
- Produces: `prisma` singleton export from `src/lib/db.ts`; Prisma models `User`, `KbArticle`, `Attachment`, `Tag` used by all later tasks.

- [ ] **Step 1: Install Prisma**

Run: `npm install prisma @prisma/client && npx prisma init --datasource-provider postgresql`

- [ ] **Step 2: Write schema**

Replace `prisma/schema.prisma` body (keep the generated `generator`/`datasource` blocks) with:

```prisma
enum Role {
  admin
  editor
  read_only
}

enum DocType {
  kb_article
  sop
  work_instruction
  known_issue
  runbook
  faq
  troubleshooting_guide
}

enum ArticleStatus {
  draft
  published
}

model User {
  id                String   @id @default(cuid())
  email             String   @unique
  name              String
  role              Role
  passwordHash      String
  mustResetPassword Boolean  @default(true)
  createdAt         DateTime @default(now())
  articles          KbArticle[]
}

model KbArticle {
  id                 String        @id @default(cuid())
  title              String
  docType            DocType
  environment        String?
  affectedServices   String[]
  symptoms           String?
  errorMessages      String[]
  rootCause          String?
  resolution         String?
  alternativeFixes   String?
  verificationSteps  String?
  prevention         String?
  relatedKbIds       String[]
  relatedTicketRefs  String[]
  keywords           String[]
  summary            String?
  category           String?
  status             ArticleStatus @default(draft)
  authorId           String
  author             User          @relation(fields: [authorId], references: [id])
  lastReviewed       DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  attachments        Attachment[]
  tags               Tag[]         @relation("ArticleTags")
}

model Attachment {
  id          String    @id @default(cuid())
  articleId   String
  article     KbArticle @relation(fields: [articleId], references: [id])
  blobUrl     String
  filename    String
  contentType String
  size        Int
  createdAt   DateTime  @default(now())
}

model Tag {
  id       String      @id @default(cuid())
  name     String      @unique
  articles KbArticle[] @relation("ArticleTags")
}
```

- [ ] **Step 3: Create Prisma client singleton**

Create `src/lib/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 4: Run migration against local dev Postgres**

Run: `npx prisma migrate dev --name init`
Expected: migration applied, `@prisma/client` types generated.

- [ ] **Step 5: Write seed script for first admin user**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  const tempPassword = process.env.SEED_ADMIN_PASSWORD
  if (!email || !tempPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set')
  }
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin',
      role: 'admin',
      passwordHash,
      mustResetPassword: true,
    },
  })
}

main().finally(() => prisma.$disconnect())
```

Add to `package.json` scripts: `"db:migrate": "prisma migrate dev"`, `"db:seed": "tsx prisma/seed.ts"`. Run: `npm install -D tsx`.

- [ ] **Step 6: Write a test verifying the Prisma client connects**

Create `tests/lib/db.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'

describe('db', () => {
  it('connects and can query', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as one`
    expect(result).toEqual([{ one: 1 }])
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })
})
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/lib/db.test.ts`
Expected: PASS (requires `DATABASE_URL` pointed at a real local/dev Postgres)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema for users/articles/attachments/tags"
```

---

### Task 3: Password Hashing + User Creation

**Files:**
- Create: `src/lib/users.ts`
- Test: `tests/lib/users.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.ts` (Task 2).
- Produces: `createUser(email: string, name: string, role: Role): Promise<{ user: User; tempPassword: string }>`, `verifyPassword(plain: string, hash: string): Promise<boolean>` — consumed by Task 4 (auth) and Task 7 (user management API).

- [ ] **Step 1: Install bcrypt**

Run: `npm install bcrypt && npm install -D @types/bcrypt`

- [ ] **Step 2: Write failing test**

Create `tests/lib/users.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/users.test.ts`
Expected: FAIL — `@/lib/users` does not exist

- [ ] **Step 3: Implement**

Create `src/lib/users.ts`:

```typescript
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/db'
import type { Role, User } from '@prisma/client'

export function generateTempPassword(): string {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16)
}

export async function createUser(
  email: string,
  name: string,
  role: Role
): Promise<{ user: User; tempPassword: string }> {
  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  const user = await prisma.user.create({
    data: { email, name, role, passwordHash, mustResetPassword: true },
  })
  return { user, tempPassword }
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add user creation and password verification helpers"
```

---

### Task 4: NextAuth Credentials Auth + RBAC Middleware

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Test: `tests/lib/auth.test.ts`, `tests/middleware.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 3), `prisma.user.findUnique` (Task 2).
- Produces: `authOptions` config with `session.user.role: 'admin' | 'editor' | 'read_only'`; middleware exports `config.matcher` protecting `/articles/*`, `/search`.

- [ ] **Step 1: Install NextAuth**

Run: `npm install next-auth@beta` (Auth.js v5 — confirm the current stable/beta tag at implementation time and record the exact resolved version here).

- [ ] **Step 2: Write failing test for credentials authorize function**

Create `tests/lib/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { authorizeCredentials } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as users from '@/lib/users'

vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/users', () => ({ verifyPassword: vi.fn() }))

describe('authorizeCredentials', () => {
  it('returns the user object when credentials are valid', async () => {
    const dbUser = { id: '1', email: 'a@b.com', name: 'A', role: 'editor', passwordHash: 'h', mustResetPassword: false }
    ;(prisma.user.findUnique as any).mockResolvedValue(dbUser)
    ;(users.verifyPassword as any).mockResolvedValue(true)

    const result = await authorizeCredentials({ email: 'a@b.com', password: 'pw' })

    expect(result).toEqual({ id: '1', email: 'a@b.com', name: 'A', role: 'editor', mustResetPassword: false })
  })

  it('returns null when password is wrong', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue({ id: '1', passwordHash: 'h' })
    ;(users.verifyPassword as any).mockResolvedValue(false)

    expect(await authorizeCredentials({ email: 'a@b.com', password: 'wrong' })).toBeNull()
  })

  it('returns null when no user exists', async () => {
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    expect(await authorizeCredentials({ email: 'nobody@b.com', password: 'pw' })).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/auth.test.ts`
Expected: FAIL — `@/lib/auth` does not exist

- [ ] **Step 4: Implement auth config**

Create `src/lib/auth.ts`:

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/users'

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
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: authorizeCredentials,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.mustResetPassword = user.mustResetPassword
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as string
      session.user.mustResetPassword = token.mustResetPassword as boolean
      return session
    },
  },
  pages: { signIn: '/login' },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 6: Wire the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 7: Write failing middleware test**

Create `tests/middleware.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { canAccess } from '@/middleware'

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
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- tests/middleware.test.ts`
Expected: FAIL — `canAccess` not defined

- [ ] **Step 9: Implement middleware + RBAC rule function**

Create `src/middleware.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

type Role = 'admin' | 'editor' | 'read_only'

export function canAccess(role: Role, path: string, method: string): boolean {
  if (role === 'admin') return true
  if (path.startsWith('/api/users')) return false
  if (path.startsWith('/api/articles')) {
    if (method === 'GET') return true
    return role === 'editor'
  }
  if (path.startsWith('/api/search')) return method === 'GET'
  return false
}

export default auth((req) => {
  const role = req.auth?.user?.role as Role | undefined
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
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- tests/middleware.test.ts`
Expected: PASS

- [ ] **Step 11: Build login page**

Create `src/app/login/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('Invalid email or password')
      return
    }
    router.push('/search')
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-24 space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full border rounded p-2" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full border rounded p-2" />
      <button type="submit" className="w-full bg-black text-white rounded p-2">Sign in</button>
    </form>
  )
}
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add NextAuth credentials auth and RBAC middleware"
```

---

### Task 5: Forced Password Reset Flow

**Files:**
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/api/users/reset-password/route.ts`
- Test: `tests/api/reset-password.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `prisma` (Tasks 2-3), `auth()` session (Task 4).
- Produces: `POST /api/users/reset-password` — consumed only by the reset-password page.

- [ ] **Step 1: Write failing test**

Create `tests/api/reset-password.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/users/reset-password/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

vi.mock('@/lib/db', () => ({ prisma: { user: { update: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

describe('POST /api/users/reset-password', () => {
  it('rejects passwords under 12 characters', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: '1' } })
    const req = new Request('http://x/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'short' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('updates the password hash and clears mustResetPassword when valid', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: '1' } })
    const req = new Request('http://x/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'a-long-enough-password' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: expect.objectContaining({ mustResetPassword: false }),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/reset-password.test.ts`
Expected: FAIL — route module does not exist

- [ ] **Step 3: Implement route**

Create `src/app/api/users/reset-password/route.ts`:

```typescript
import bcrypt from 'bcrypt'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { newPassword } = await req.json()
  if (typeof newPassword !== 'string' || newPassword.length < 12) {
    return Response.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
  }
  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustResetPassword: false },
  })
  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/reset-password.test.ts`
Expected: PASS

- [ ] **Step 5: Build reset-password page**

Create `src/app/reset-password/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error)
      return
    }
    router.push('/search')
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-24 space-y-4">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="New password (12+ chars)" className="w-full border rounded p-2" />
      <button type="submit" className="w-full bg-black text-white rounded p-2">Set password</button>
    </form>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add forced password reset flow"
```

---

### Task 6: Azure Blob Storage Wrapper

**Files:**
- Create: `src/lib/blob.ts`
- Test: `tests/lib/blob.test.ts`

**Interfaces:**
- Consumes: `AZURE_STORAGE_CONNECTION_STRING` env var.
- Produces: `uploadAttachment(file: { buffer: Buffer; filename: string; contentType: string }): Promise<{ blobUrl: string }>` — consumed by Task 7's attachment endpoint.

- [ ] **Step 1: Install SDK**

Run: `npm install @azure/storage-blob`

- [ ] **Step 2: Write failing test**

Create `tests/lib/blob.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockUpload = vi.fn().mockResolvedValue({})
const mockGetBlockBlobClient = vi.fn().mockReturnValue({ upload: mockUpload, url: 'https://acct.blob.core.windows.net/attachments/abc-file.pdf' })
const mockGetContainerClient = vi.fn().mockReturnValue({ getBlockBlobClient: mockGetBlockBlobClient })

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: vi.fn().mockReturnValue({ getContainerClient: mockGetContainerClient }),
  },
}))

import { uploadAttachment } from '@/lib/blob'

describe('uploadAttachment', () => {
  it('uploads the buffer and returns the blob url', async () => {
    const result = await uploadAttachment({
      buffer: Buffer.from('test'),
      filename: 'file.pdf',
      contentType: 'application/pdf',
    })
    expect(mockUpload).toHaveBeenCalled()
    expect(result.blobUrl).toContain('file.pdf')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/blob.test.ts`
Expected: FAIL — `@/lib/blob` does not exist

- [ ] **Step 4: Implement**

Create `src/lib/blob.ts`:

```typescript
import { BlobServiceClient } from '@azure/storage-blob'
import crypto from 'node:crypto'

const CONTAINER_NAME = 'attachments'

function getContainerClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
  const serviceClient = BlobServiceClient.fromConnectionString(connectionString)
  return serviceClient.getContainerClient(CONTAINER_NAME)
}

export async function uploadAttachment(file: {
  buffer: Buffer
  filename: string
  contentType: string
}): Promise<{ blobUrl: string }> {
  const containerClient = getContainerClient()
  const blobName = `${crypto.randomUUID()}-${file.filename}`
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)
  await blockBlobClient.upload(file.buffer, file.buffer.length, {
    blobHTTPHeaders: { blobContentType: file.contentType },
  })
  return { blobUrl: blockBlobClient.url }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/blob.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Azure Blob Storage attachment upload wrapper"
```

---

### Task 7: Article CRUD API

**Files:**
- Create: `src/lib/articleSchema.ts`
- Create: `src/app/api/articles/route.ts`
- Create: `src/app/api/articles/[id]/route.ts`
- Test: `tests/api/articles.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `uploadAttachment` (Task 6), `auth()` (Task 4).
- Produces: `POST /api/articles`, `GET /api/articles`, `GET /api/articles/:id`, `PUT /api/articles/:id` — consumed by Task 8 (authoring UI) and Task 9 (auto-tagging on publish).

- [ ] **Step 1: Define Zod schema**

Run: `npm install zod`

Create `src/lib/articleSchema.ts`:

```typescript
import { z } from 'zod'

export const articleInputSchema = z.object({
  title: z.string().min(3),
  docType: z.enum([
    'kb_article', 'sop', 'work_instruction', 'known_issue', 'runbook', 'faq', 'troubleshooting_guide',
  ]),
  environment: z.string().optional(),
  affectedServices: z.array(z.string()).default([]),
  symptoms: z.string().optional(),
  errorMessages: z.array(z.string()).default([]),
  rootCause: z.string().optional(),
  resolution: z.string().optional(),
  alternativeFixes: z.string().optional(),
  verificationSteps: z.string().optional(),
  prevention: z.string().optional(),
  relatedKbIds: z.array(z.string()).default([]),
  relatedTicketRefs: z.array(z.string()).default([]),
})

export type ArticleInput = z.infer<typeof articleInputSchema>
```

- [ ] **Step 2: Write failing test**

Create `tests/api/articles.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST, GET } from '@/app/api/articles/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

vi.mock('@/lib/db', () => ({
  prisma: { kbArticle: { create: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

describe('POST /api/articles', () => {
  it('rejects when role is read_only', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: '1', role: 'read_only' } })
    const req = new Request('http://x/api/articles', { method: 'POST', body: JSON.stringify({ title: 'T', docType: 'kb_article' }) })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('rejects invalid body', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: '1', role: 'editor' } })
    const req = new Request('http://x/api/articles', { method: 'POST', body: JSON.stringify({ title: 'ab' }) })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates article as draft for editor', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: '1', role: 'editor' } })
    ;(prisma.kbArticle.create as any).mockResolvedValue({ id: 'a1', status: 'draft' })
    const req = new Request('http://x/api/articles', { method: 'POST', body: JSON.stringify({ title: 'Outlook fix', docType: 'kb_article' }) })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prisma.kbArticle.create).toHaveBeenCalled()
  })
})

describe('GET /api/articles', () => {
  it('returns published articles for any authenticated role', async () => {
    ;(auth as any).mockResolvedValue({ user: { id: '1', role: 'read_only' } })
    ;(prisma.kbArticle.findMany as any).mockResolvedValue([{ id: 'a1', status: 'published' }])
    const res = await GET(new Request('http://x/api/articles'))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/api/articles.test.ts`
Expected: FAIL — route module does not exist

- [ ] **Step 4: Implement collection route**

Create `src/app/api/articles/route.ts`:

```typescript
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { articleInputSchema } from '@/lib/articleSchema'

export async function POST(req: Request) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'editor' && role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = articleInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const article = await prisma.kbArticle.create({
    data: { ...parsed.data, authorId: session!.user!.id, status: 'draft' },
  })
  return Response.json(article, { status: 201 })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const articles = await prisma.kbArticle.findMany({ where: { status: 'published' } })
  return Response.json(articles, { status: 200 })
}
```

- [ ] **Step 5: Implement single-article route**

Create `src/app/api/articles/[id]/route.ts`:

```typescript
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { articleInputSchema } from '@/lib/articleSchema'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const article = await prisma.kbArticle.findUnique({ where: { id: params.id } })
  if (!article) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(article)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'editor' && role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = articleInputSchema.partial().safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const article = await prisma.kbArticle.update({ where: { id: params.id }, data: parsed.data })
  return Response.json(article)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/api/articles.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add article CRUD API with RBAC and Zod validation"
```

---

### Task 8: Article Authoring UI

**Files:**
- Create: `src/app/(dashboard)/articles/new/page.tsx`
- Create: `src/app/(dashboard)/articles/[id]/page.tsx`
- Test: `tests/app/articles-new.test.tsx`

**Interfaces:**
- Consumes: `POST /api/articles`, `PUT /api/articles/:id` (Task 7), `articleInputSchema` (Task 7).
- Produces: authoring form used directly by engineers — no downstream task depends on its internals.

- [ ] **Step 1: Write failing UI test**

Create `tests/app/articles-new.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NewArticlePage from '@/app/(dashboard)/articles/new/page'

describe('NewArticlePage', () => {
  it('submits the form to POST /api/articles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a1' }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewArticlePage />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Outlook credential loop' } })
    fireEvent.click(screen.getByText('Save draft'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/articles', expect.objectContaining({ method: 'POST' })))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/articles-new.test.tsx`
Expected: FAIL — page module does not exist

- [ ] **Step 3: Implement the form**

Create `src/app/(dashboard)/articles/new/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DOC_TYPES = ['kb_article', 'sop', 'work_instruction', 'known_issue', 'runbook', 'faq', 'troubleshooting_guide']

export default function NewArticlePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState(DOC_TYPES[0])
  const [symptoms, setSymptoms] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [resolution, setResolution] = useState('')

  async function handleSubmit() {
    const res = await fetch('/api/articles', {
      method: 'POST',
      body: JSON.stringify({ title, docType, symptoms, rootCause, resolution }),
    })
    if (res.ok) {
      const article = await res.json()
      router.push(`/articles/${article.id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-xl font-semibold">New KB Article</h1>
      <label className="block">
        Title
        <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <label className="block">
        Type
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full border rounded p-2">
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="block">
        Symptoms
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <label className="block">
        Root Cause
        <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <label className="block">
        Resolution
        <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <button onClick={handleSubmit} className="bg-black text-white rounded p-2 px-4">Save draft</button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app/articles-new.test.tsx`
Expected: PASS

- [ ] **Step 5: Implement view/edit page**

Create `src/app/(dashboard)/articles/[id]/page.tsx`:

```tsx
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'

export default async function ArticlePage({ params }: { params: { id: string } }) {
  const article = await prisma.kbArticle.findUnique({ where: { id: params.id } })
  if (!article) notFound()

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-xl font-semibold">{article.title}</h1>
      <p className="text-sm text-gray-500">{article.docType} — {article.status}</p>
      <section><h2 className="font-medium">Symptoms</h2><p>{article.symptoms}</p></section>
      <section><h2 className="font-medium">Root Cause</h2><p>{article.rootCause}</p></section>
      <section><h2 className="font-medium">Resolution</h2><p>{article.resolution}</p></section>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add article authoring and view UI"
```

---

### Task 9: Claude Client Wrapper + Auto-Tagging

**Files:**
- Create: `src/lib/claude.ts`
- Test: `tests/lib/claude.test.ts`

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY` env var.
- Produces: `extractMetadata(articleText: string): Promise<{ keywords: string[]; tags: string[]; summary: string; category: string }>` — consumed by Task 13 (publish pipeline); `synthesizeAnswer(question: string, chunks: RetrievedChunk[]): Promise<string>` — consumed by Task 14.

- [ ] **Step 1: Install SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write failing test**

Create `tests/lib/claude.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { extractMetadata, synthesizeAnswer } from '@/lib/claude'

describe('extractMetadata', () => {
  it('parses the JSON block returned by Claude', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"keywords":["outlook","ost"],"tags":["Exchange Online"],"summary":"Corrupt OST fix.","category":"Email"}' }],
    })
    const result = await extractMetadata('Outlook will not open due to corrupt OST cache.')
    expect(result).toEqual({
      keywords: ['outlook', 'ost'],
      tags: ['Exchange Online'],
      summary: 'Corrupt OST fix.',
      category: 'Email',
    })
  })
})

describe('synthesizeAnswer', () => {
  it('passes retrieved chunks into the prompt and returns Claude text', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Probable cause: corrupt OST. [KB-1]' }] })
    const result = await synthesizeAnswer('Outlook wont open', [
      { articleId: 'KB-1', text: 'Recreate the Outlook profile to fix a corrupt OST cache.' },
    ])
    expect(result).toContain('KB-1')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('KB-1') })]),
      })
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/claude.test.ts`
Expected: FAIL — `@/lib/claude` does not exist

- [ ] **Step 4: Implement**

Create `src/lib/claude.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export interface RetrievedChunk {
  articleId: string
  text: string
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return new Anthropic({ apiKey })
}

function textOf(response: { content: Array<{ type: string; text?: string }> }): string {
  const block = response.content.find((b) => b.type === 'text')
  if (!block?.text) throw new Error('Claude response had no text block')
  return block.text
}

export async function extractMetadata(articleText: string): Promise<{
  keywords: string[]
  tags: string[]
  summary: string
  category: string
}> {
  const client = getClient()
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract metadata from this KB article as strict JSON with keys keywords (string[]), tags (string[]), summary (string), category (string). Article:\n\n${articleText}`,
    }],
  })
  return JSON.parse(textOf(response))
}

export async function synthesizeAnswer(question: string, chunks: RetrievedChunk[]): Promise<string> {
  const client = getClient()
  const context = chunks.map((c) => `[${c.articleId}] ${c.text}`).join('\n\n')
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a support troubleshooting assistant. Using only the KB excerpts below, answer the engineer's question with: probable causes, troubleshooting steps, known fixes, relevant PowerShell commands if any, and an escalation recommendation. Cite article ids in brackets like [KB-1] inline.\n\nExcerpts:\n${context}\n\nQuestion: ${question}`,
    }],
  })
  return textOf(response)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/claude.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Claude wrapper for metadata extraction and RAG synthesis"
```

---

### Task 10: Article Chunking

**Files:**
- Create: `src/lib/chunk.ts`
- Test: `tests/lib/chunk.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `chunkArticle(article: { id: string; title: string; symptoms?: string | null; rootCause?: string | null; resolution?: string | null; alternativeFixes?: string | null }): Chunk[]`, `Chunk = { id: string; articleId: string; section: string; text: string }` — consumed by Task 13.

- [ ] **Step 1: Write failing test**

Create `tests/lib/chunk.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { chunkArticle } from '@/lib/chunk'

describe('chunkArticle', () => {
  it('produces one chunk per non-empty section, tagged with section name', () => {
    const chunks = chunkArticle({
      id: 'a1',
      title: 'Outlook wont open',
      symptoms: 'Outlook crashes on launch.',
      rootCause: 'Corrupt OST cache.',
      resolution: 'Recreate the Outlook profile.',
      alternativeFixes: null,
    })
    expect(chunks).toEqual([
      { id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'Outlook crashes on launch.' },
      { id: 'a1-rootCause', articleId: 'a1', section: 'rootCause', text: 'Corrupt OST cache.' },
      { id: 'a1-resolution', articleId: 'a1', section: 'resolution', text: 'Recreate the Outlook profile.' },
    ])
  })

  it('skips null/empty sections', () => {
    const chunks = chunkArticle({ id: 'a2', title: 'T', symptoms: '', rootCause: null, resolution: 'Fix.' })
    expect(chunks).toEqual([{ id: 'a2-resolution', articleId: 'a2', section: 'resolution', text: 'Fix.' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/chunk.test.ts`
Expected: FAIL — `@/lib/chunk` does not exist

- [ ] **Step 3: Implement**

Create `src/lib/chunk.ts`:

```typescript
export interface Chunk {
  id: string
  articleId: string
  section: string
  text: string
}

interface ChunkableArticle {
  id: string
  title: string
  symptoms?: string | null
  rootCause?: string | null
  resolution?: string | null
  alternativeFixes?: string | null
}

const SECTIONS = ['symptoms', 'rootCause', 'resolution', 'alternativeFixes'] as const

export function chunkArticle(article: ChunkableArticle): Chunk[] {
  const chunks: Chunk[] = []
  for (const section of SECTIONS) {
    const text = article[section]
    if (text) {
      chunks.push({ id: `${article.id}-${section}`, articleId: article.id, section, text })
    }
  }
  return chunks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/chunk.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add article chunking by section"
```

---

### Task 11: Azure OpenAI Embeddings Wrapper

**Files:**
- Create: `src/lib/embeddings.ts`
- Test: `tests/lib/embeddings.test.ts`

**Interfaces:**
- Consumes: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` env vars.
- Produces: `embed(texts: string[]): Promise<number[][]>` — consumed by Task 13.

- [ ] **Step 1: Install SDK**

Run: `npm install openai`

- [ ] **Step 2: Write failing test**

Create `tests/lib/embeddings.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockCreate }
  },
}))

import { embed } from '@/lib/embeddings'

describe('embed', () => {
  it('returns one vector per input text, in order', async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
    })
    const result = await embed(['first', 'second'])
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/embeddings.test.ts`
Expected: FAIL — `@/lib/embeddings` does not exist

- [ ] **Step 4: Implement**

Create `src/lib/embeddings.ts`:

```typescript
import OpenAI from 'openai'

function getClient(): OpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  if (!endpoint || !apiKey) throw new Error('AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY not set')
  return new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/deployments/${process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT}`,
    defaultQuery: { 'api-version': '2024-06-01' },
    defaultHeaders: { 'api-key': apiKey },
  })
}

export async function embed(texts: string[]): Promise<number[][]> {
  const client = getClient()
  const response = await client.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ?? '',
    input: texts,
  })
  return response.data.map((d) => d.embedding)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/embeddings.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Azure OpenAI embeddings wrapper"
```

---

### Task 12: Azure AI Search Wrapper

**Files:**
- Create: `src/lib/search.ts`
- Test: `tests/lib/search.test.ts`

**Interfaces:**
- Consumes: `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_API_KEY`, `AZURE_SEARCH_INDEX_NAME` env vars.
- Produces: `indexChunks(entries: IndexEntry[]): Promise<void>`, `hybridSearch(query: string, queryVector: number[]): Promise<SearchResult[]>` — consumed by Task 13 (indexing) and Task 14 (query).

- [ ] **Step 1: Install SDK**

Run: `npm install @azure/search-documents`

- [ ] **Step 2: Write failing test**

Create `tests/lib/search.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockUploadDocuments = vi.fn().mockResolvedValue({})
const mockSearch = vi.fn()
vi.mock('@azure/search-documents', () => ({
  SearchClient: class {
    uploadDocuments = mockUploadDocuments
    search = mockSearch
  },
  AzureKeyCredential: class {},
}))

import { indexChunks, hybridSearch } from '@/lib/search'

describe('indexChunks', () => {
  it('uploads chunk documents with id/articleId/text/vector fields', async () => {
    await indexChunks([{ id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1, 0.2] }])
    expect(mockUploadDocuments).toHaveBeenCalledWith([
      { id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1, 0.2] },
    ])
  })
})

describe('hybridSearch', () => {
  it('returns top results with articleId/text/score', async () => {
    mockSearch.mockResolvedValue({
      results: (async function* () {
        yield { document: { id: 'a1-symptoms', articleId: 'a1', text: 'crash' }, score: 0.9 }
      })(),
    })
    const results = await hybridSearch('outlook crash', [0.1, 0.2])
    expect(results).toEqual([{ articleId: 'a1', text: 'crash', score: 0.9 }])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/search.test.ts`
Expected: FAIL — `@/lib/search` does not exist

- [ ] **Step 4: Implement**

Create `src/lib/search.ts`:

```typescript
import { SearchClient, AzureKeyCredential } from '@azure/search-documents'

export interface IndexEntry {
  id: string
  articleId: string
  section: string
  text: string
  vector: number[]
}

export interface SearchResult {
  articleId: string
  text: string
  score: number
}

function getClient(): SearchClient<IndexEntry> {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT
  const apiKey = process.env.AZURE_SEARCH_API_KEY
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME
  if (!endpoint || !apiKey || !indexName) throw new Error('Azure AI Search env vars not set')
  return new SearchClient<IndexEntry>(endpoint, indexName, new AzureKeyCredential(apiKey))
}

export async function indexChunks(entries: IndexEntry[]): Promise<void> {
  const client = getClient()
  await client.uploadDocuments(entries)
}

export async function hybridSearch(query: string, queryVector: number[]): Promise<SearchResult[]> {
  const client = getClient()
  const response = await client.search(query, {
    vectorSearchOptions: { queries: [{ kind: 'vector', vector: queryVector, fields: ['vector'], kNearestNeighborsCount: 10 }] },
    queryType: 'semantic',
    top: 10,
  })
  const results: SearchResult[] = []
  for await (const r of response.results) {
    results.push({ articleId: r.document.articleId, text: r.document.text, score: r.score ?? 0 })
  }
  return results
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/search.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Azure AI Search hybrid indexing and query wrapper"
```

- [ ] **Step 7: Close the index-schema gap — add `createIndexIfNotExists()`**

**Why:** Task 12's review approved `indexChunks`/`hybridSearch`, but nothing in this plan creates the actual Azure AI Search **index** (the schema — fields, vector config, semantic config) inside the search *service*. Task 17's `infra/create-resources.sh` only runs `az search service create`, which provisions the empty service, not an index. Without this, `indexChunks` and `hybridSearch` have no index to talk to, and `hybridSearch`'s `queryType: 'semantic'` would throw at query time anyway, because a semantic configuration with no `defaultConfigurationName` is rejected by the service. This step was added after Task 12 was reviewed and approved, to close that gap.

**Files:** `src/lib/search.ts`, `tests/lib/search.test.ts`

Add to `src/lib/search.ts` (alongside the existing `SearchClient`-based `getClient()`): a `SearchIndexClient`-based `getIndexClient()` helper following the same env-var pattern, an `isNotFoundError()` guard, a `buildIndexSchema()` builder, and the exported function itself:

```typescript
import { SearchClient, SearchIndexClient, AzureKeyCredential, type SearchIndex } from '@azure/search-documents'

// text-embedding-3-large's default (non-truncated) output dimensionality — see src/lib/embeddings.ts,
// which does not pass a `dimensions` override, so every vector indexed/queried is this width.
const VECTOR_DIMENSIONS = 3072
const VECTOR_ALGORITHM_NAME = 'kb-hnsw'
const VECTOR_PROFILE_NAME = 'kb-vector-profile'
const SEMANTIC_CONFIG_NAME = 'kb-semantic-config'

function getIndexClient(): { client: SearchIndexClient; indexName: string } {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT
  const apiKey = process.env.AZURE_SEARCH_API_KEY
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME
  if (!endpoint || !apiKey || !indexName) throw new Error('Azure AI Search env vars not set')
  return { client: new SearchIndexClient(endpoint, new AzureKeyCredential(apiKey)), indexName }
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode?: number }).statusCode === 404
}

function buildIndexSchema(indexName: string): SearchIndex {
  return {
    name: indexName,
    fields: [
      { name: 'id', type: 'Edm.String', key: true, filterable: true },
      { name: 'articleId', type: 'Edm.String', filterable: true },
      { name: 'section', type: 'Edm.String', filterable: true },
      { name: 'text', type: 'Edm.String', searchable: true },
      {
        name: 'vector',
        type: 'Collection(Edm.Single)',
        searchable: true,
        vectorSearchDimensions: VECTOR_DIMENSIONS,
        vectorSearchProfileName: VECTOR_PROFILE_NAME,
      },
    ],
    vectorSearch: {
      algorithms: [{ name: VECTOR_ALGORITHM_NAME, kind: 'hnsw' }],
      profiles: [{ name: VECTOR_PROFILE_NAME, algorithmConfigurationName: VECTOR_ALGORITHM_NAME }],
    },
    // `hybridSearch`'s `queryType: 'semantic'` throws at query time if the index has a semantic
    // configuration but no `defaultConfigurationName` — set it explicitly so callers never have to
    // pass a configuration name on every query.
    semanticSearch: {
      defaultConfigurationName: SEMANTIC_CONFIG_NAME,
      configurations: [
        {
          name: SEMANTIC_CONFIG_NAME,
          prioritizedFields: { contentFields: [{ name: 'text' }] },
        },
      ],
    },
  }
}

export async function createIndexIfNotExists(): Promise<void> {
  const { client, indexName } = getIndexClient()
  try {
    await client.getIndex(indexName)
    return
  } catch (err) {
    if (!isNotFoundError(err)) throw err
  }
  await client.createIndex(buildIndexSchema(indexName))
}
```

Idempotency: `getIndex(indexName)` is checked first; a 404 means "not found" and falls through to `createIndex`; any other error (auth failure, throttling, etc.) is rethrown rather than misread as "missing." If the index already exists, `getIndex` resolves and the function returns without calling `createIndex` — safe to call on every app startup.

Add to `tests/lib/search.test.ts`: extend the `@azure/search-documents` mock with a `SearchIndexClient` class exposing `getIndex`/`createIndex` mocks, then add a `describe('createIndexIfNotExists', ...)` block with three cases — (1) `getIndex` rejects with `{ statusCode: 404 }` → asserts `createIndex` is called once with the exact schema (fields, `vectorSearch`, `semanticSearch.defaultConfigurationName`); (2) `getIndex` resolves (index already exists) → asserts `createIndex` is never called; (3) `getIndex` rejects with a non-404 error → asserts it propagates and `createIndex` is never called.

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/lib/search.test.ts`
Expected: PASS (all `indexChunks`/`hybridSearch`/`createIndexIfNotExists` cases green)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add createIndexIfNotExists to provision the Azure AI Search index schema"
```

---

### Task 13: Publish Pipeline (Chunk -> Embed -> Index) + Auto-Tag

**Files:**
- Create: `src/lib/indexArticle.ts`
- Create: `src/app/api/articles/[id]/publish/route.ts`
- Test: `tests/lib/indexArticle.test.ts`, `tests/api/publish.test.ts`

**Interfaces:**
- Consumes: `chunkArticle` (Task 10), `embed` (Task 11), `indexChunks` (Task 12), `extractMetadata` (Task 9), `prisma` (Task 2).
- Produces: `indexArticle(article): Promise<void>` — used only by the publish route.

- [ ] **Step 1: Write failing test for the pipeline function**

Create `tests/lib/indexArticle.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { indexArticle } from '@/lib/indexArticle'
import * as embeddings from '@/lib/embeddings'
import * as search from '@/lib/search'

vi.mock('@/lib/embeddings', () => ({ embed: vi.fn() }))
vi.mock('@/lib/search', () => ({ indexChunks: vi.fn() }))

describe('indexArticle', () => {
  it('chunks the article, embeds each chunk, and indexes them with vectors attached', async () => {
    ;(embeddings.embed as any).mockResolvedValue([[0.1], [0.2]])

    await indexArticle({ id: 'a1', title: 'T', symptoms: 'crash', rootCause: 'ost', resolution: null, alternativeFixes: null })

    expect(embeddings.embed).toHaveBeenCalledWith(['crash', 'ost'])
    expect(search.indexChunks).toHaveBeenCalledWith([
      { id: 'a1-symptoms', articleId: 'a1', section: 'symptoms', text: 'crash', vector: [0.1] },
      { id: 'a1-rootCause', articleId: 'a1', section: 'rootCause', text: 'ost', vector: [0.2] },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/indexArticle.test.ts`
Expected: FAIL — `@/lib/indexArticle` does not exist

- [ ] **Step 3: Implement**

Create `src/lib/indexArticle.ts`:

```typescript
import { chunkArticle } from '@/lib/chunk'
import { embed } from '@/lib/embeddings'
import { indexChunks } from '@/lib/search'

interface ArticleForIndexing {
  id: string
  title: string
  symptoms?: string | null
  rootCause?: string | null
  resolution?: string | null
  alternativeFixes?: string | null
}

export async function indexArticle(article: ArticleForIndexing): Promise<void> {
  const chunks = chunkArticle(article)
  if (chunks.length === 0) return
  const vectors = await embed(chunks.map((c) => c.text))
  await indexChunks(chunks.map((c, i) => ({ ...c, vector: vectors[i] })))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/indexArticle.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for the publish route**

Create `tests/api/publish.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/articles/[id]/publish/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import * as claude from '@/lib/claude'
import * as indexModule from '@/lib/indexArticle'

vi.mock('@/lib/db', () => ({ prisma: { kbArticle: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/claude', () => ({ extractMetadata: vi.fn() }))
vi.mock('@/lib/indexArticle', () => ({ indexArticle: vi.fn() }))

describe('POST /api/articles/:id/publish', () => {
  it('extracts metadata, indexes the article, and marks it published', async () => {
    ;(auth as any).mockResolvedValue({ user: { role: 'editor' } })
    ;(prisma.kbArticle.findUnique as any).mockResolvedValue({ id: 'a1', title: 'T', symptoms: 'crash', rootCause: null, resolution: 'fix', alternativeFixes: null })
    ;(claude.extractMetadata as any).mockResolvedValue({ keywords: ['k'], tags: ['t'], summary: 's', category: 'c' })

    const res = await POST(new Request('http://x', { method: 'POST' }), { params: { id: 'a1' } })

    expect(indexModule.indexArticle).toHaveBeenCalled()
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'published', keywords: ['k'], summary: 's', category: 'c' },
    })
    expect(res.status).toBe(200)
  })

  it('rejects read_only', async () => {
    ;(auth as any).mockResolvedValue({ user: { role: 'read_only' } })
    const res = await POST(new Request('http://x', { method: 'POST' }), { params: { id: 'a1' } })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/api/publish.test.ts`
Expected: FAIL — route module does not exist

- [ ] **Step 7: Implement publish route**

Create `src/app/api/articles/[id]/publish/route.ts`:

```typescript
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { extractMetadata } from '@/lib/claude'
import { indexArticle } from '@/lib/indexArticle'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'editor' && role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const article = await prisma.kbArticle.findUnique({ where: { id: params.id } })
  if (!article) return Response.json({ error: 'Not found' }, { status: 404 })

  const articleText = [article.symptoms, article.rootCause, article.resolution].filter(Boolean).join('\n\n')
  const metadata = await extractMetadata(articleText)
  await indexArticle(article)
  await prisma.kbArticle.update({
    where: { id: params.id },
    data: { status: 'published', keywords: metadata.keywords, summary: metadata.summary, category: metadata.category },
  })
  return Response.json({ ok: true })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/api/publish.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add publish pipeline wiring auto-tagging and search indexing"
```

---

### Task 14: Search API (Retrieval + RAG Synthesis)

**Files:**
- Create: `src/lib/ragAnswer.ts`
- Create: `src/app/api/search/route.ts`
- Test: `tests/lib/ragAnswer.test.ts`, `tests/api/search.test.ts`

**Interfaces:**
- Consumes: `embed` (Task 11), `hybridSearch` (Task 12), `synthesizeAnswer` (Task 9).
- Produces: `GET /api/search?q=...` returning `{ answer: string; results: SearchResult[] }` — consumed by Task 15 (Search UI).

- [ ] **Step 1: Write failing test for ragAnswer**

Create `tests/lib/ragAnswer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import * as embeddings from '@/lib/embeddings'
import * as search from '@/lib/search'
import * as claude from '@/lib/claude'

vi.mock('@/lib/embeddings', () => ({ embed: vi.fn() }))
vi.mock('@/lib/search', () => ({ hybridSearch: vi.fn() }))
vi.mock('@/lib/claude', () => ({ synthesizeAnswer: vi.fn() }))

import { getAnswer } from '@/lib/ragAnswer'

describe('getAnswer', () => {
  it('embeds the query, retrieves chunks, and synthesizes an answer from them', async () => {
    ;(embeddings.embed as any).mockResolvedValue([[0.1, 0.2]])
    ;(search.hybridSearch as any).mockResolvedValue([{ articleId: 'a1', text: 'crash', score: 0.9 }])
    ;(claude.synthesizeAnswer as any).mockResolvedValue('Probable cause: X [a1]')

    const result = await getAnswer('outlook crash')

    expect(embeddings.embed).toHaveBeenCalledWith(['outlook crash'])
    expect(search.hybridSearch).toHaveBeenCalledWith('outlook crash', [0.1, 0.2])
    expect(claude.synthesizeAnswer).toHaveBeenCalledWith('outlook crash', [{ articleId: 'a1', text: 'crash' }])
    expect(result).toEqual({ answer: 'Probable cause: X [a1]', results: [{ articleId: 'a1', text: 'crash', score: 0.9 }] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/ragAnswer.test.ts`
Expected: FAIL — `@/lib/ragAnswer` does not exist

- [ ] **Step 3: Implement**

Create `src/lib/ragAnswer.ts`:

```typescript
import { embed } from '@/lib/embeddings'
import { hybridSearch, type SearchResult } from '@/lib/search'
import { synthesizeAnswer } from '@/lib/claude'

export async function getAnswer(query: string): Promise<{ answer: string; results: SearchResult[] }> {
  const [queryVector] = await embed([query])
  const results = await hybridSearch(query, queryVector)
  const answer = await synthesizeAnswer(query, results.map((r) => ({ articleId: r.articleId, text: r.text })))
  return { answer, results }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/ragAnswer.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for the API route**

Create `tests/api/search.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/search/route'
import { auth } from '@/lib/auth'
import * as ragAnswer from '@/lib/ragAnswer'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ragAnswer', () => ({ getAnswer: vi.fn() }))

describe('GET /api/search', () => {
  it('requires a q parameter', async () => {
    ;(auth as any).mockResolvedValue({ user: { role: 'read_only' } })
    const res = await GET(new Request('http://x/api/search'))
    expect(res.status).toBe(400)
  })

  it('returns the RAG answer and results', async () => {
    ;(auth as any).mockResolvedValue({ user: { role: 'read_only' } })
    ;(ragAnswer.getAnswer as any).mockResolvedValue({ answer: 'ans', results: [] })
    const res = await GET(new Request('http://x/api/search?q=outlook+crash'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ answer: 'ans', results: [] })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/api/search.test.ts`
Expected: FAIL — route module does not exist

- [ ] **Step 7: Implement route**

Create `src/app/api/search/route.ts`:

```typescript
import { auth } from '@/lib/auth'
import { getAnswer } from '@/lib/ragAnswer'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('q')
  if (!q) return Response.json({ error: 'Missing q parameter' }, { status: 400 })
  const result = await getAnswer(q)
  return Response.json(result, { status: 200 })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/api/search.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add search API combining hybrid retrieval with Claude RAG synthesis"
```

---

### Task 15: Search UI

**Files:**
- Create: `src/app/(dashboard)/search/page.tsx`
- Test: `tests/app/search.test.tsx`

**Interfaces:**
- Consumes: `GET /api/search?q=...` (Task 14).
- Produces: the engineer-facing search page — terminal task, nothing downstream depends on it.

- [ ] **Step 1: Write failing test**

Create `tests/app/search.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SearchPage from '@/app/(dashboard)/search/page'

describe('SearchPage', () => {
  it('shows the AI answer above the cited article list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'Probable cause: corrupt OST [a1]', results: [{ articleId: 'a1', text: 'Recreate profile', score: 0.9 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<SearchPage />)
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'outlook crash' } })
    fireEvent.click(screen.getByText('Search'))

    await waitFor(() => expect(screen.getByText(/Probable cause/)).toBeInTheDocument())
    expect(screen.getByText('Recreate profile')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=outlook+crash')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/search.test.tsx`
Expected: FAIL — page module does not exist

- [ ] **Step 3: Implement**

Create `src/app/(dashboard)/search/page.tsx`:

```tsx
'use client'
import { useState } from 'react'

interface SearchResult {
  articleId: string
  text: string
  score: number
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    setLoading(true)
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const body = await res.json()
    setAnswer(body.answer)
    setResults(body.results)
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-6">
      <div className="flex gap-2">
        <input
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Error message, app name, or symptom..."
          className="flex-1 border rounded p-2"
        />
        <button onClick={handleSearch} className="bg-black text-white rounded px-4">Search</button>
      </div>
      {loading && <p>Searching...</p>}
      {answer && (
        <section className="bg-gray-50 border rounded p-4 whitespace-pre-wrap">{answer}</section>
      )}
      {results.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Source articles</h2>
          {results.map((r) => (
            <a key={r.articleId} href={`/articles/${r.articleId}`} className="block border rounded p-3 hover:bg-gray-50">
              <p className="text-sm text-gray-500">{r.articleId} — score {r.score.toFixed(2)}</p>
              <p>{r.text}</p>
            </a>
          ))}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app/search.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add search UI with AI answer and cited article list"
```

---

### Task 16: CI Pipeline + Application Insights

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `src/app/layout.tsx` (App Insights init)
- Test: none (infra/config task — verified by pipeline run, not unit test)

**Interfaces:**
- Consumes: `npm test`, `npm run lint`, `npm run build` scripts (Task 1).
- Produces: green-required GitHub Actions check on PRs; a deployed staging slot.

- [ ] **Step 1: Install Application Insights SDK**

Run: `npm install @microsoft/applicationinsights-web`

- [ ] **Step 2: Wire App Insights into the root layout**

Modify `src/app/layout.tsx` to initialize it client-side:

```tsx
'use client'
import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import { useEffect } from 'react'
import './globals.css'

let appInsights: ApplicationInsights | undefined

function useAppInsights() {
  useEffect(() => {
    if (!appInsights && process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING) {
      appInsights = new ApplicationInsights({
        config: { connectionString: process.env.NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING },
      })
      appInsights.loadAppInsights()
      appInsights.trackPageView()
    }
  }, [])
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useAppInsights()
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

Add `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING=""` to `.env.example`.

- [ ] **Step 3: Write CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  deploy-staging:
    needs: build-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: azure/webapps-deploy@v3
        with:
          app-name: 'kb-platform-pilot'
          slot-name: 'staging'
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
```

- [ ] **Step 4: Pin the Node version file used by CI**

Create `.nvmrc` with the exact Node LTS version recorded in Task 1, Step 1.

- [ ] **Step 5: Verify the workflow syntax**

Run: `npx action-validator .github/workflows/ci.yml` (or push a branch and confirm the Actions run triggers without a YAML parse error).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "ci: add build/test/deploy pipeline and Application Insights wiring"
```

---

### Task 17: Infra Provisioning Script (Generated, Not Auto-Run)

**Files:**
- Create: `infra/create-resources.sh`

**Interfaces:**
- Consumes: nothing — a standalone az-cli script the user reviews and runs manually.
- Produces: instructions for the Azure resources this app depends on. Does not execute automatically; requires explicit user action per org policy on deploys/resource creation.

- [ ] **Step 1: Write the resource-creation script**

Create `infra/create-resources.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RG=rg-kbplatform-pilot
LOCATION=southcentralus
TAGS="project=kb-platform env=pilot owner=<fill-in-before-running>"

az group create --name "$RG" --location "$LOCATION" --tags $TAGS

az postgres flexible-server create \
  --resource-group "$RG" --name kbplatform-pilot-pg \
  --location "$LOCATION" --tier Burstable --sku-name Standard_B1ms \
  --tags $TAGS

az storage account create \
  --resource-group "$RG" --name kbplatformpilotsa \
  --location "$LOCATION" --sku Standard_LRS \
  --tags $TAGS

az search service create \
  --resource-group "$RG" --name kbplatform-pilot-search \
  --sku basic --location "$LOCATION"

az cognitiveservices account create \
  --resource-group "$RG" --name kbplatform-pilot-openai \
  --kind OpenAI --sku S0 --location "$LOCATION" \
  --tags $TAGS

az keyvault create \
  --resource-group "$RG" --name kbplatform-pilot-kv \
  --location "$LOCATION" --tags $TAGS

az monitor app-insights component create \
  --resource-group "$RG" --app kbplatform-pilot-ai \
  --location "$LOCATION" --tags $TAGS

az appservice plan create \
  --resource-group "$RG" --name kbplatform-pilot-plan \
  --location "$LOCATION" --is-linux --sku B1 --tags $TAGS

az webapp create \
  --resource-group "$RG" --plan kbplatform-pilot-plan \
  --name kb-platform-pilot --runtime "NODE:22-lts" --tags $TAGS

az webapp deployment slot create \
  --resource-group "$RG" --name kb-platform-pilot --slot staging

echo "Resources created. Next: populate Key Vault secrets, wire App Service settings to Key Vault references, deploy the Azure OpenAI embeddings model via the Azure AI Foundry portal (no CLI GA for model deployment as of this writing — verify before running)."
```

- [ ] **Step 2: Note in the script header that this is generated, not executed**

Add a comment at the top of the file:

```bash
# GENERATED SCRIPT — review every resource name/SKU/tag before running.
# Requires explicit user approval per Fornida policy before any resource creation or deploy.
# Fill in the owner tag before running.
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add generated infra provisioning script (review before running)"
```

---

### Task 18: README + Docs Finalization

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: onboarding doc so any Fornida engineer can pick up the project independently.

- [ ] **Step 1: Expand README with full setup, run, test, and deploy sections**

Replace `README.md` contents:

```markdown
# KB System

Internal Knowledge Management Platform for L2/L3 support engineers — KB article
authoring plus AI-assisted search (single search box, cited troubleshooting
answers). First sub-project of a larger platform; see
`docs/superpowers/specs/2026-07-15-kb-core-search-design.md` for full context
and deferred scope (ticket DB, script repo, workflow trees, dashboards, etc).

## Stack

Next.js 15 (App Router, TS) monolith. Azure Postgres Flexible (Prisma). Azure
Blob Storage. Azure AI Search (hybrid keyword+semantic+vector). Azure OpenAI
(embeddings only). Claude (Anthropic SDK, all chat/reasoning). NextAuth
credentials auth, 3-tier RBAC (admin/editor/read_only).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local`. Pull real values from Azure Key Vault
   (`kbplatform-pilot-kv`) via `az keyvault secret show` — never paste secrets
   from chat, docs, or Slack into this file.
3. `npm run db:migrate`
4. `SEED_ADMIN_EMAIL=you@fornida.com SEED_ADMIN_PASSWORD=<temp> npm run db:seed`
5. `npm run dev` — app at `localhost:3000`

## Test

`npm test` — Vitest, mocks all external SDKs (Blob/Search/OpenAI/Anthropic).

## Deploy

Push to `main` triggers `.github/workflows/ci.yml`: lint, test, build, then
deploy to the `staging` slot on `kb-platform-pilot`. Promote to prod via a
manual slot swap (`az webapp deployment slot swap`), not automatic.

## Infra

`infra/create-resources.sh` is a generated, reviewed-not-run script listing
every Azure resource this app needs. Run it manually after filling in the
owner tag; do not automate its execution.

## Scope

See the design spec for what's explicitly out of scope for this sub-project.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: finalize README with setup, test, deploy, and scope pointers"
```

---

### Task 19: Server-Side Audit Logging (added after final whole-branch review)

**Why:** the final whole-branch review found that the only telemetry in the app is
client-side `appInsights.trackPageView()` (Task 16) — no API route or lib module
logs anything server-side. For Fornida's CMMC 2.0 L1 / SOC 2 posture, privileged
actions (login success/failure, password reset, article publish, user writes)
need an audit trail. This task adds that, using the Azure resources already
provisioned in Task 17 (Application Insights) rather than a new service.

**Files:**
- Create: `src/lib/logger.ts`
- Modify: `src/lib/auth.ts` (log login success/failure)
- Modify: `src/app/api/users/reset-password/route.ts` (log password reset)
- Modify: `src/app/api/articles/route.ts` (log article create)
- Modify: `src/app/api/articles/[id]/route.ts` (log article update)
- Modify: `src/app/api/articles/[id]/publish/route.ts` (log publish)
- Test: `tests/lib/logger.test.ts`

**Interfaces:**
- Consumes: `APPLICATIONINSIGHTS_CONNECTION_STRING` env var (server-side, distinct
  from Task 16's `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` — this one must NOT
  be prefixed `NEXT_PUBLIC_`, since it's a server secret, not something to ship
  to the browser bundle).
- Produces: `logAuditEvent(name: string, properties: Record<string, string | number | boolean>): void`
  — consumed by every route/module listed above.

- [ ] **Step 1: Install the Node Application Insights SDK**

Run: `npm install applicationinsights`

- [ ] **Step 2: Write failing test**

Create `tests/lib/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTrackEvent = vi.fn()
vi.mock('applicationinsights', () => ({
  defaultClient: { trackEvent: mockTrackEvent },
  setup: vi.fn().mockReturnThis(),
  start: vi.fn(),
}))

import { logAuditEvent } from '@/lib/logger'

describe('logAuditEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the event name and properties to Application Insights when configured', () => {
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test'
    logAuditEvent('article.publish', { articleId: 'a1', role: 'editor' })
    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: 'article.publish',
      properties: { articleId: 'a1', role: 'editor' },
    })
  })

  it('does not throw when Application Insights is not configured', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    expect(() => logAuditEvent('article.publish', { articleId: 'a1' })).not.toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/logger.test.ts`
Expected: FAIL — `@/lib/logger` does not exist

- [ ] **Step 4: Implement**

Create `src/lib/logger.ts`:

```typescript
import * as appInsights from 'applicationinsights'

let started = false

function ensureStarted(): boolean {
  if (started) return true
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
  if (!connectionString) return false
  appInsights.setup(connectionString).start()
  started = true
  return true
}

export function logAuditEvent(
  name: string,
  properties: Record<string, string | number | boolean>
): void {
  if (!ensureStarted()) return
  appInsights.defaultClient.trackEvent({ name, properties })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/logger.test.ts`
Expected: PASS

- [ ] **Step 6: Wire into auth (login success/failure)**

In `src/lib/auth.ts`'s `authorizeCredentials`, call `logAuditEvent('auth.login_success', { email: creds.email })` on a successful return and `logAuditEvent('auth.login_failure', { email: creds.email })` on each `null` return path (wrong password, no user). Never log the password itself.

- [ ] **Step 7: Wire into reset-password, article create/update/publish**

Add one `logAuditEvent(...)` call at the point each action succeeds:
- `reset-password/route.ts`: `logAuditEvent('auth.password_reset', { userId: session.user.id })`
- `articles/route.ts` POST: `logAuditEvent('article.create', { articleId: article.id, authorId, role })`
- `articles/[id]/route.ts` PUT: `logAuditEvent('article.update', { articleId: params.id, role })`
- `articles/[id]/publish/route.ts`: `logAuditEvent('article.publish', { articleId: params.id, role })`

Never log article content, password hashes, or tokens — only ids/roles/emails needed to reconstruct "who did what, when."

- [ ] **Step 8: Add the env var to `.env.example`**

Add `APPLICATIONINSIGHTS_CONNECTION_STRING=""` (server-side, no `NEXT_PUBLIC_` prefix).

- [ ] **Step 9: Run the full verification suite**

Run: `npx tsc --noEmit`, `npx eslint .`, `npm test`, `npm run build` — all four clean.

- [ ] **Step 10: Update README**

Remove item 9 from "Known Gaps / Follow-ups" (audit logging) now that it's closed, or update it to note logging exists but hasn't been validated against a real Application Insights instance yet (this environment has no real connection string to test against for real).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add server-side audit logging for auth and article write actions"
```

---

## Self-Review Notes

- **Spec coverage:** architecture (Task 1,4,6,9,11,12,16), data model (Task 2), search/RAG flow (Task 10,11,12,13,14), ingestion (Task 6,7,8), auth/RBAC (Task 3,4,5), deployment (Task 16,17,18) — all six spec sections have at least one task.
- **Placeholder scan:** no TBD/TODO; the two "verify at implementation time" notes (Node version, next-auth resolved version, Azure OpenAI model-deploy CLI status) are explicit verification steps, not unfilled requirements.
- **Type consistency:** `Chunk` (Task 10) → consumed by `indexArticle` (Task 13) with `.vector` added → matches `IndexEntry` (Task 12). `RetrievedChunk` (Task 9) matches the `{ articleId, text }` shape passed from `SearchResult` (Task 12) in `ragAnswer.ts` (Task 14). `Role` values (`admin`/`editor`/`read_only`) consistent across Prisma schema (Task 2), auth (Task 4), middleware (Task 4), and route handlers (Tasks 5, 7, 13).
