// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow v5.2.0 — Prisma Client (PostgreSQL)
// Connection pooling, graceful shutdown, singleton pattern
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'
import { logError, logOk, logInfo } from '@/lib/logger'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const isProd = process.env.NODE_ENV === 'production'

  return new PrismaClient({
    log: process.env.PRISMA_LOG === 'true'
      ? ['query', 'error', 'warn', 'info']
      : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Connection pool settings for PostgreSQL
    ...(isProd ? {
      // Let Prisma handle pooling in standalone mode
    } : {}),
  })
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient()

// Keep singleton in development for hot reload
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// ─── Graceful Shutdown ─────────────────────────────────────────

export async function disconnectDB(): Promise<void> {
  try {
    await db.$disconnect()
    logInfo('DB', 'disconnected', {})
  } catch (err) {
    logError('DB', 'disconnect_error', err)
  }
}

// ─── Connection Health Check ───────────────────────────────────

export async function dbHealthCheck(): Promise<{
  status: 'healthy' | 'unhealthy'
  latencyMs: number
  error?: string
}> {
  try {
    const start = performance.now()
    await db.$queryRaw`SELECT 1 as ok`
    const latencyMs = Math.round(performance.now() - start)
    return { status: 'healthy', latencyMs }
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: -1,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export default db
