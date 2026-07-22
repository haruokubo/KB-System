import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { articleInputSchema } from '@/lib/articleSchema'
import { logAuditEvent } from '@/lib/logger'

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

  // `client`/`tools` arrive as a client name / tool names, not ids — resolve
  // them to the related rows via Prisma's nested `connect` rather than
  // storing them as plain scalars. Using `connect` for `client`/`tools`
  // forces the "checked" create-input variant, so `author` must be wired
  // the same way (`connect`) rather than via the `authorId` scalar —
  // Prisma's generated types don't allow mixing scalar foreign keys with
  // nested relation writes in the same `create` call.
  const { client, tools, ...rest } = parsed.data
  const article = await prisma.kbArticle.create({
    data: {
      ...rest,
      author: { connect: { id: userId } },
      status: 'draft',
      ...(client ? { client: { connect: { name: client } } } : {}),
      tools: { connect: tools.map((name) => ({ name })) },
    },
  })
  logAuditEvent('article.create', { articleId: article.id, authorId: userId, role })
  return Response.json(article, { status: 201 })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js route handler signature always receives `req`; the collection GET doesn't need it.
export async function GET(_req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const articles = await prisma.kbArticle.findMany({
    where: { status: 'published' },
    include: { client: true, tools: true },
  })
  return Response.json(articles, { status: 200 })
}
