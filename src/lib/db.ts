// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Prisma Client (SQLite / PostgreSQL)
// Singleton with WAL mode for SQLite concurrency
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
          ? process.env.DATABASE_URL.includes('file:') || process.env.DATABASE_URL.includes('sqlite')
            ? process.env.DATABASE_URL + '&connection_limit=1&pool_timeout=10'
            : process.env.DATABASE_URL
          : undefined,
      },
    },
  })

// Enable WAL mode and FK constraints for SQLite (best-effort)
async function initSQLite() {
  try {
    const isSQLite = !!process.env.DATABASE_URL?.includes('file:') || !!process.env.DATABASE_URL?.includes('sqlite')
    if (!isSQLite) return
    // Run pragmas via raw query
    await db.$queryRawUnsafe('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
    console.log('[DB] SQLite: WAL + FK + busy_timeout=5s enabled')
  } catch {
    // Non-SQLite or pragma not supported — skip silently
  }
}

// Delay init to let Prisma fully connect
setTimeout(() => initSQLite().catch(() => {}), 1000)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
