import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { extractMetadata } from '@/lib/claude'
import { indexArticle } from '@/lib/indexArticle'
import { logAuditEvent } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: RouteContext) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'editor' && role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const article = await prisma.kbArticle.findUnique({ where: { id } })
  if (!article) return Response.json({ error: 'Not found' }, { status: 404 })

  const articleText = [article.symptoms, article.rootCause, article.resolution].filter(Boolean).join('\n\n')
  const metadata = await extractMetadata(articleText)
  await indexArticle(article)
  await prisma.kbArticle.update({
    where: { id },
    data: { status: 'published', keywords: metadata.keywords, summary: metadata.summary, category: metadata.category },
  })
  logAuditEvent('article.publish', { articleId: id, role })
  return Response.json({ ok: true })
}
