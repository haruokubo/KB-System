import { auth } from '@/lib/auth'
import { getAnswer } from '@/lib/ragAnswer'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('q')
  if (!q) return Response.json({ error: 'Missing q parameter' }, { status: 400 })
  const result = await getAnswer(q)
  return Response.json(result, { status: 200 })
}
