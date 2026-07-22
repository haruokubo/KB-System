import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomePage from '@/app/(dashboard)/page'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { Session } from 'next-auth'
import type { KbArticle } from '@/generated/prisma/client'

// HomePage is an async server component (calls `auth()` and `prisma` directly,
// same shape as `src/app/(dashboard)/articles/[id]/page.tsx`), so mock those
// two collaborators the same way the API route tests do (e.g.
// tests/api/articles.test.ts), then `await` the component function itself to
// get its resolved JSX before handing it to `render` — RTL's `render` doesn't
// await async components on its own.
vi.mock('@/lib/db', () => ({
  prisma: { kbArticle: { findMany: vi.fn() } },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// See tests/api/reset-password.test.ts for why `auth` must be narrowed to its
// zero-arg `() => Promise<Session | null>` overload before mocking.
const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)

function fakeSession(name: string): Session {
  return {
    user: { id: '1', email: 'a@b.com', name, role: 'editor', mustResetPassword: false },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

function fakeArticle(overrides: Partial<KbArticle> = {}): KbArticle {
  return {
    id: 'a1',
    title: 'Outlook fix',
    docType: 'kb_article',
    environment: null,
    affectedServices: [],
    symptoms: null,
    errorMessages: [],
    rootCause: null,
    resolution: null,
    alternativeFixes: null,
    verificationSteps: null,
    prevention: null,
    relatedKbIds: [],
    relatedTicketRefs: [],
    keywords: [],
    summary: null,
    category: null,
    status: 'published',
    authorId: '1',
    lastReviewed: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    clientId: null,
    ...overrides,
  }
}

describe('HomePage', () => {
  afterEach(() => vi.clearAllMocks())

  it('greets the signed-in user by name', async () => {
    mockedAuth.mockResolvedValue(fakeSession('Haru Okubo'))
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([])

    render(await HomePage())

    expect(screen.getByText(/Welcome, Haru Okubo/)).toBeInTheDocument()
  })

  it('lists recently updated published articles, most recent first, capped at 5', async () => {
    mockedAuth.mockResolvedValue(fakeSession('Haru Okubo'))
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([
      fakeArticle({ id: 'a1', title: 'Outlook credential loop', docType: 'kb_article' }),
      fakeArticle({ id: 'a2', title: 'VPN drop on reconnect', docType: 'known_issue' }),
    ])

    render(await HomePage())

    expect(prisma.kbArticle.findMany).toHaveBeenCalledWith({
      where: { status: 'published' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    const first = screen.getByText('Outlook credential loop')
    expect(first).toBeInTheDocument()
    expect(first.closest('a')).toHaveAttribute('href', '/articles/a1')
    expect(screen.getByText('VPN drop on reconnect').closest('a')).toHaveAttribute('href', '/articles/a2')
    expect(screen.getByText('kb_article')).toBeInTheDocument()
  })

  it('shows quick links to search and new article', async () => {
    mockedAuth.mockResolvedValue(fakeSession('Haru Okubo'))
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([])

    render(await HomePage())

    expect(screen.getByText('Search').closest('a')).toHaveAttribute('href', '/search')
    expect(screen.getByText('New Article').closest('a')).toHaveAttribute('href', '/articles/new')
  })

  it('shows a fallback message when there are no published articles', async () => {
    mockedAuth.mockResolvedValue(fakeSession('Haru Okubo'))
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([])

    render(await HomePage())

    expect(screen.getByText('No published articles yet.')).toBeInTheDocument()
  })
})
