import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js route handler signature always receives `req`; this collection GET doesn't need it.
export async function GET(_req: Request) {
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tools = await prisma.tool.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return Response.json(tools, { status: 200 })
}
