'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('Invalid email or password')
      return
    }
    router.push('/search')
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-24 space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full border rounded p-2" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full border rounded p-2" />
      <button type="submit" className="w-full bg-black text-white rounded p-2">Sign in</button>
    </form>
  )
}
