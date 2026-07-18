import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST, GET } from '@/app/api/articles/route'
import { GET as GET_ONE, PUT } from '@/app/api/articles/[id]/route'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import type { Role, KbArticle } from '@/generated/prisma/client'

vi.mock('@/lib/db', () => ({
  prisma: {
    kbArticle: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// See tests/api/reset-password.test.ts for why `auth` must be narrowed to its
// zero-arg `() => Promise<Session | null>` overload before mocking.
const mockedAuth = vi.mocked(auth as unknown as () => Promise<Session | null>)

function fakeSession(role: Role, id = '1'): Session {
  return {
    user: { id, email: 'a@b.com', name: 'A', role, mustResetPassword: false },
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
    status: 'draft',
    authorId: '1',
    lastReviewed: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('POST /api/articles', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects when role is read_only', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    const req = new Request('http://x/api/articles', {
      method: 'POST',
      body: JSON.stringify({ title: 'T', docType: 'kb_article' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('rejects invalid body', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    const req = new Request('http://x/api/articles', {
      method: 'POST',
      body: JSON.stringify({ title: 'ab' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates article as draft for editor', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.create).mockResolvedValue(fakeArticle())
    const req = new Request('http://x/api/articles', {
      method: 'POST',
      body: JSON.stringify({ title: 'Outlook fix', docType: 'kb_article' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prisma.kbArticle.create).toHaveBeenCalled()
  })
})

describe('GET /api/articles', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    mockedAuth.mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/articles'))
    expect(res.status).toBe(401)
  })

  it('returns published articles for any authenticated role', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    vi.mocked(prisma.kbArticle.findMany).mockResolvedValue([fakeArticle({ status: 'published' })])
    const res = await GET(new Request('http://x/api/articles'))
    expect(res.status).toBe(200)
  })
})

describe('GET /api/articles/:id', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects unauthenticated requests', async () => {
    mockedAuth.mockResolvedValue(null)
    const res = await GET_ONE(new Request('http://x/api/articles/a1'), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the article does not exist', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(null)
    const res = await GET_ONE(new Request('http://x/api/articles/missing'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns the article for any authenticated role', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    vi.mocked(prisma.kbArticle.findUnique).mockResolvedValue(fakeArticle())
    const res = await GET_ONE(new Request('http://x/api/articles/a1'), { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/articles/:id', () => {
  afterEach(() => vi.clearAllMocks())

  it('rejects when role is read_only', async () => {
    mockedAuth.mockResolvedValue(fakeSession('read_only'))
    const req = new Request('http://x/api/articles/a1', { method: 'PUT', body: JSON.stringify({ title: 'New title' }) })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(403)
  })

  it('rejects invalid body', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    const req = new Request('http://x/api/articles/a1', { method: 'PUT', body: JSON.stringify({ docType: 'not_a_type' }) })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(400)
  })

  it('updates the article for editor', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.update).mockResolvedValue(fakeArticle({ title: 'New title' }))
    const req = new Request('http://x/api/articles/a1', { method: 'PUT', body: JSON.stringify({ title: 'New title' }) })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { title: 'New title' } })
  })
})
