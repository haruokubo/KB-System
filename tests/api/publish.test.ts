import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST } from '@/app/api/articles/[id]/publish/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import * as claude from '@/lib/claude'
import * as indexModule from '@/lib/indexArticle'
import type { Session } from 'next-auth'
import type { KbArticle } from '@/generated/prisma/client'

vi.mock('@/lib/db', () => ({ prisma: { kbArticle: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/claude', () => ({ extractMetadata: vi.fn() }))
vi.mock('@/lib/indexArticle', () => ({ indexArticle: vi.fn() }))

// See tests/api/reset-password.test.ts for why `auth` must be narrowed to its
// zero-arg `() => Promise<Session | null>` overload before mocking.
const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)

function fakeSession(role: Session['user']['role']): Session {
  return {
    user: { id: '1', email: 'a@b.com', name: 'A', role, mustResetPassword: false },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

function fakeArticle(overrides: Partial<KbArticle> = {}): KbArticle {
  return {
    id: 'a1',
    title: 'T',
    docType: 'kb_article',
    environment: null,
    affectedServices: [],
    symptoms: 'crash',
    errorMessages: [],
    rootCause: null,
    resolution: 'fix',
    alternativeFixes: null,
    verificationSteps: null,
    prevention: null,
    relatedKbIds: [],
    relatedTicketRefs: [],
    keywords: [],
    summary: null,
    category: null,
    status: 'draft',
    authorId: '1',
    lastReviewed: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('POST /api/articles/:id/publish', () => {
  afterEach(() => vi.clearAllMocks())

  it('extracts metadata, indexes the article, and marks it published', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(fakeArticle())
    vi.mocked(claude.extractMetadata).mockResolvedValue({ keywords: ['k'], tags: ['t'], summary: 's', category: 'c' })

    const res = await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'a1' }) })

    expect(indexModule.indexArticle).toHaveBeenCalled()
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { status: 'published', keywords: ['k'], summary: 's', category: 'c' },
    })
    expect(res.status).toBe(200)
  })

  it('rejects read_only', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    const res = await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when the article does not exist', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(null)
    const res = await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
