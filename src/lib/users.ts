import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/db'
import type { Role, User } from '@/generated/prisma/client'

export function generateTempPassword(): string {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16)
}

export async function createUser(
  email: string,
  name: string,
  role: Role
): Promise<{ user: User; tempPassword: string }> {
  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  const user = await prisma.user.create({
    data: { email, name, role, passwordHash, mustResetPassword: true },
  })
  return { user, tempPassword }
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
