import bcrypt from 'bcrypt'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAuditEvent } from '@/lib/logger'

function extractNewPassword(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('newPassword' in body)) {
    return undefined
  }
  return (body as { newPassword: unknown }).newPassword
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: unknown = await req.json()
  const newPassword = extractNewPassword(body)
  if (typeof newPassword !== 'string' || newPassword.length < 12) {
    return Response.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustResetPassword: false },
  })
  logAuditEvent('auth.password_reset', { userId: session.user.id })
  return Response.json({ ok: true })
}
