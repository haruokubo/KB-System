import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export default async function HomePage() {
  const session = await auth()
  const name = session?.user?.name ?? 'there'

  const recentArticles = await prisma.kbArticle.findMany({
    where: { status: 'published' },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Welcome, {name}</h1>
        <p className="text-sm text-gray-500">Fornida internal knowledge base</p>
      </div>

      <div className="flex gap-3">
        <Link href="/search" className="bg-black text-white rounded px-4 py-2 text-sm">
          Search
        </Link>
        <Link href="/articles/new" className="border rounded px-4 py-2 text-sm">
          New Article
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Recently updated articles</h2>
        {recentArticles.length === 0 ? (
          <p className="text-sm text-gray-500">No published articles yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentArticles.map((article) => (
              <li key={article.id} className="border rounded p-3 hover:bg-gray-50">
                <Link href={`/articles/${article.id}`} className="block">
                  <p className="font-medium">{article.title}</p>
                  <p className="text-sm text-gray-500">{article.docType}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
