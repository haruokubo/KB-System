'use client'
import { useState } from 'react'

interface SearchResult {
  articleId: string
  text: string
  score: number
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    setLoading(true)
    const res = await fetch(`/api/search?${new URLSearchParams({ q: query })}`)
    const body = await res.json()
    setAnswer(body.answer)
    setResults(body.results)
    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-6">
      <div className="flex gap-2">
        <input
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Error message, app name, or symptom..."
          className="flex-1 border rounded p-2"
        />
        <button onClick={handleSearch} className="bg-black text-white rounded px-4">Search</button>
      </div>
      {loading && <p>Searching...</p>}
      {answer && (
        <section className="bg-gray-50 border rounded p-4 whitespace-pre-wrap">{answer}</section>
      )}
      {results.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Source articles</h2>
          {results.map((r) => (
            <a key={r.articleId} href={`/articles/${r.articleId}`} className="block border rounded p-3 hover:bg-gray-50">
              <p className="text-sm text-gray-500">{r.articleId} — score {r.score.toFixed(2)}</p>
              <p>{r.text}</p>
            </a>
          ))}
        </section>
      )}
    </div>
  )
}
