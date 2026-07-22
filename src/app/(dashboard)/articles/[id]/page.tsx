import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { PublishButton } from './PublishButton'

type ArticlePageProps = { params: Promise<{ id: string }> }

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { id } = await params
  const [article, session] = await Promise.all([
    prisma.kbArticle.findUnique({
      where: { id },
      include: { client: true, tools: true },
    }),
    auth(),
  ])
  if (!article) notFound()

  const role = session?.user?.role
  const canPublish = article.status === 'draft' && (role === 'admin' || role === 'editor')

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-xl font-semibold">{article.title}</h1>
      <p className="text-sm text-gray-500">{article.docType} — {article.status}</p>
      {article.status === 'draft' && (
        <p className="text-sm text-amber-600">
          This article is a draft. It will not appear in search results until published.
        </p>
      )}
      {canPublish && <PublishButton articleId={article.id} />}
      {article.client && (
        <p className="text-sm text-gray-500">Client: {article.client.name}</p>
      )}
      {article.tools.length > 0 && (
        <p className="text-sm text-gray-500">Tools: {article.tools.map((t) => t.name).join(', ')}</p>
      )}
      <section><h2 className="font-medium">Symptoms</h2><p>{article.symptoms}</p></section>
      <section><h2 className="font-medium">Root Cause</h2><p>{article.rootCause}</p></section>
      <section><h2 className="font-medium">Resolution</h2><p>{article.resolution}</p></section>
    </div>
  )
}
