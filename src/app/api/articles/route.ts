import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { articleInputSchema } from '@/lib/articleSchema'

export async function POST(req: Request) {
  const session = await auth()
  const role = session?.user?.role
  const userId = session?.user?.id
  if (!userId || (role !== 'editor' && role !== 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body: unknown = await req.json()
  const parsed = articleInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const article = await prisma.kbArticle.create({
    data: { ...parsed.data, authorId: userId, status: 'draft' },
  })
  return Response.json(article, { status: 201 })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js route handler signature always receives `req`; the collection GET doesn't need it.
export async function GET(_req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const articles = await prisma.kbArticle.findMany({ where: { status: 'published' } })
  return Response.json(articles, { status: 200 })
}
