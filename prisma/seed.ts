import dotenv from 'dotenv'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

// tsx doesn't auto-load env files the way Next.js does — match
// prisma.config.ts's precedence (.env.local overrides .env) so `npm run
// db:seed` works the same way `npm run dev` and `prisma migrate dev` do.
dotenv.config()
dotenv.config({ path: '.env.local', override: true })

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
