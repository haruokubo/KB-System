'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PublishButton({ articleId }: { articleId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePublish() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/articles/${articleId}/publish`, { method: 'POST' })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      const message =
        typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : 'Failed to publish'
      setError(message)
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handlePublish}
        disabled={loading}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {loading ? 'Publishing...' : 'Publish'}
      </button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
