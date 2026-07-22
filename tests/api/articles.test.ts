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
    clientId: null,
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

  it('connects client and tools by name when provided', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.create).mockResolvedValue(fakeArticle())
    const req = new Request('http://x/api/articles', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Outlook fix',
        docType: 'kb_article',
        client: 'Exalt Health',
        tools: ['Sonicwall', 'Bullphish ID'],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prisma.kbArticle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client: { connect: { name: 'Exalt Health' } },
        tools: { connect: [{ name: 'Sonicwall' }, { name: 'Bullphish ID' }] },
      }),
    })
  })

  it('omits the client relation and connects no tools when neither is provided', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.create).mockResolvedValue(fakeArticle())
    const req = new Request('http://x/api/articles', {
      method: 'POST',
      body: JSON.stringify({ title: 'Outlook fix', docType: 'kb_article' }),
    })
    await POST(req)
    expect(prisma.kbArticle.create).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.kbArticle.create).mock.calls.at(0)?.at(0)
    expect(call?.data).not.toHaveProperty('client')
    expect(call?.data).toEqual(expect.objectContaining({ tools: { connect: [] } }))
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

  it('clears an array field when it is explicitly sent as empty', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.update).mockResolvedValue(fakeArticle({ title: 'New title', affectedServices: [] }))
    const req = new Request('http://x/api/articles/a1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'New title', affectedServices: [] }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { title: 'New title', affectedServices: [] },
    })
  })

  it('connects only client when only client is provided, without touching tools', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.update).mockResolvedValue(fakeArticle())
    const req = new Request('http://x/api/articles/a1', {
      method: 'PUT',
      body: JSON.stringify({ client: 'Exalt Health' }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { client: { connect: { name: 'Exalt Health' } } },
    })
  })

  it('sets only tools when only tools is provided, without touching client', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.update).mockResolvedValue(fakeArticle())
    const req = new Request('http://x/api/articles/a1', {
      method: 'PUT',
      body: JSON.stringify({ tools: ['Sonicwall'] }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { tools: { set: [{ name: 'Sonicwall' }] } },
    })
  })

  it('clears tools when explicitly sent as empty, without touching client', async () => {
    mockedAuth.mockResolvedValue(fakeSession('editor'))
    vi.mocked(prisma.kbArticle.update).mockResolvedValue(fakeArticle())
    const req = new Request('http://x/api/articles/a1', {
      method: 'PUT',
      body: JSON.stringify({ tools: [] }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'a1' }) })
    expect(res.status).toBe(200)
    expect(prisma.kbArticle.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { tools: { set: [] } },
    })
  })
})
