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

// Fornida's current customer roster. Seeded by name (upsert) so re-running
// this script is idempotent and adding/removing a client later is a DB row
// change, not a code deploy.
const CLIENTS = [
  'Exalt Health',
  'Pumas AI',
  'Advantage Gold, LLC',
  'Beazley Security',
  'Boffo Cinemas / Thelotent',
  'Boise IT',
  'Calibartion Specialty, Inc',
  'Catchall',
  'City of Beatrice',
  'Comark Equity Alliance',
  'ESP Associates',
  'Habitat commons',
  'La Sierra University',
  'LC Endodontics PLLC',
  'Lee Johnson Auto Family',
  'NAP Technologies Inc.',
  'Peer Data',
  'Reliable Plant Maintenance',
  'Right Discovery',
  'Super Industrial Products',
  'The MASYC Group',
  'WM Coffman Resources',
]

// Fornida's supported tech-stack products, for tagging which tool(s) an
// article relates to.
const TOOLS = [
  'Sonicwall',
  'Sentinel One',
  'ConnectWise Automate',
  'Microsoft 365 apps',
  'Checkpoint Harmony',
  'Bullphish ID',
  'Backup Radar',
]

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  const tempPassword = process.env.SEED_ADMIN_PASSWORD
  if (!email || !tempPassword) {
    // Only required for the one-time admin bootstrap. On environments where
    // the admin user already exists and these vars have since been unset
    // (they're temp-password material and shouldn't linger in .env.local),
    // skip the admin step rather than hard-failing the whole seed — the
    // client/tool reference data below still needs to run idempotently.
    console.warn('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping admin user upsert.')
  } else {
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

  for (const name of CLIENTS) {
    await prisma.client.upsert({ where: { name }, update: {}, create: { name } })
  }

  for (const name of TOOLS) {
    await prisma.tool.upsert({ where: { name }, update: {}, create: { name } })
  }
}

main().finally(() => prisma.$disconnect())
