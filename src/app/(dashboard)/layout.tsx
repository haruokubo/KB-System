'use client'
import Link from 'next/link'
import { signOut } from 'next-auth/react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <nav className="border-b flex items-center justify-between px-6 py-3">
        <div className="flex gap-4 text-sm font-medium">
          <Link href="/search">Search</Link>
          <Link href="/articles/new">New Article</Link>
        </div>
        <button
          onClick={() => signOut({ redirectTo: '/login' })}
          className="text-sm text-gray-500 hover:text-black"
        >
          Sign out
        </button>
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  )
}
