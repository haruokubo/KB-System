import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'

type ArticlePageProps = { params: Promise<{ id: string }> }

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { id } = await params
  const article = await prisma.kbArticle.findUnique({ where: { id } })
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
