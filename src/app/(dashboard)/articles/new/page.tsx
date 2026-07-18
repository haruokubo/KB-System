'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DOC_TYPES = ['kb_article', 'sop', 'work_instruction', 'known_issue', 'runbook', 'faq', 'troubleshooting_guide']

export default function NewArticlePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState(DOC_TYPES[0])
  const [symptoms, setSymptoms] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [resolution, setResolution] = useState('')

  async function handleSubmit() {
    const res = await fetch('/api/articles', {
      method: 'POST',
      body: JSON.stringify({ title, docType, symptoms, rootCause, resolution }),
    })
    if (res.ok) {
      const article: { id: string } = await res.json()
      router.push(`/articles/${article.id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-xl font-semibold">New KB Article</h1>
      <label className="block">
        Title
        <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <label className="block">
        Type
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full border rounded p-2">
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="block">
        Symptoms
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <label className="block">
        Root Cause
        <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <label className="block">
        Resolution
        <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full border rounded p-2" />
      </label>
      <button onClick={handleSubmit} className="bg-black text-white rounded p-2 px-4">Save draft</button>
    </div>
  )
}
