import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { articleInputSchema, type ArticleInput } from '@/lib/articleSchema'
import { logAuditEvent } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

// `articleInputSchema` applies `.default([])` to several array fields for the
// create path. `.partial()` keeps those defaults active, so parsing an update
// body through it fills in `[]` for any array field the caller omitted —
// naively spreading that into a Prisma `update` would silently wipe existing
// data on every partial edit. Only forward fields the caller actually sent.
function pickProvided(data: Partial<ArticleInput>, presentKeys: ReadonlySet<string>): Partial<ArticleInput> {
  const result: Partial<ArticleInput> = {}
  for (const key of Object.keys(data) as (keyof ArticleInput)[]) {
    if (presentKeys.has(key)) {
      Object.assign(result, { [key]: data[key] })
    }
  }
  return result
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const article = await prisma.kbArticle.findUnique({
    where: { id },
    include: { client: true, tools: true },
  })
  if (!article) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  return Response.json(article)
}

export async function PUT(req: Request, { params }: RouteContext) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'editor' && role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body: unknown = await req.json()
  const parsed = articleInputSchema.partial().safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const providedKeys = new Set(
    typeof body === 'object' && body !== null ? Object.keys(body) : [],
  )
  const { client, tools, ...scalarData } = pickProvided(parsed.data, providedKeys)

  const { id } = await params
  const article = await prisma.kbArticle.update({
    where: { id },
    data: {
      ...scalarData,
      // `client`/`tools` are relation fields resolved by name, not plain
      // scalars — only touch them when the caller's raw body actually
      // included the key, same partial-update rule pickProvided() enforces
      // for the scalar/array fields above. For `tools` (a many-to-many),
      // `connect` alone would only ever add rows and never remove ones the
      // caller dropped, so an explicit `[]` wouldn't clear it the way it
      // does for the plain array fields (see the "clears an array field"
      // test) — use `set` to fully replace the tool list instead.
      ...(providedKeys.has('client')
        ? { client: client ? { connect: { name: client } } : { disconnect: true } }
        : {}),
      ...(providedKeys.has('tools') && tools
        ? { tools: { set: tools.map((name) => ({ name })) } }
        : {}),
    },
  })
  logAuditEvent('article.update', { articleId: id, role })
  return Response.json(article)
}
