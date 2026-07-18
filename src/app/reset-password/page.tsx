'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

function extractError(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error
  }
  return 'Something went wrong'
}

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    })
    if (!res.ok) {
      const body: unknown = await res.json()
      setError(extractError(body))
      return
    }
    router.push('/search')
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-24 space-y-4">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <input
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        type="password"
        placeholder="New password (12+ chars)"
        className="w-full border rounded p-2"
      />
      <button type="submit" className="w-full bg-black text-white rounded p-2">
        Set password
      </button>
    </form>
  )
}
