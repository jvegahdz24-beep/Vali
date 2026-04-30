// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Prisma Client (SQLite / PostgreSQL)
// Singleton pattern for connection reuse
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
