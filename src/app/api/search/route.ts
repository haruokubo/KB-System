import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getAnswer } from '@/lib/ragAnswer'

const searchQuerySchema = z.string().min(1).max(1000)

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('q')
  if (!q) return Response.json({ error: 'Missing q parameter' }, { status: 400 })
  const parsed = searchQuerySchema.safeParse(q)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const result = await getAnswer(parsed.data)
  return Response.json(result, { status: 200 })
}
