import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'

describe.skipIf(!process.env.DATABASE_URL)('db', () => {
  it('connects and can query', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as one`
    expect(result).toEqual([{ one: 1 }])
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })
})
