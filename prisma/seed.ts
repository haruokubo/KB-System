import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  const tempPassword = process.env.SEED_ADMIN_PASSWORD
  if (!email || !tempPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set')
  }
  const passwordHash = await bcrypt.hash(tempPassword, 12)
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin',
      role: 'admin',
      passwordHash,
      mustResetPassword: true,
    },
  })
}

main().finally(() => prisma.$disconnect())
