// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Prisma Client (MySQL localhost)
// • Eager $connect() — avoids "Engine is not yet connected" after
//   PM2 restarts (race condition with native binary startup).
// • Global retry via $extends — auto-retries all model operations
//   on transient MySQL disconnect errors (P1017, P1001, P1008)
//   without touching the shared singleton's connection pool from
//   individual callers.
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'

// MySQL error codes that indicate a dropped/stale connection
const TRANSIENT_CODES = new Set(['P1017', 'P1001', 'P1008'])
// Transient message patterns for PrismaClientUnknownRequestError
const TRANSIENT_MESSAGES = [
  'Engine is not yet connected',
  'Server has closed the connection',
  'Connection pool timeout',
  'Unable to start a transaction',
]
const MAX_RETRIES = 4
const BASE_DELAY_MS = 300

function isTransientError(err: any): boolean {
  if (TRANSIENT_CODES.has(err?.code)) return true
  const msg: string = err?.message ?? ''
  return TRANSIENT_MESSAGES.some(m => msg.includes(m))
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error'],
  })

  // Eagerly connect so the native engine is ready before first request
  base.$connect().catch((err: unknown) => {
    console.error('[Prisma] Eager $connect() failed:', err)
  })

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              return await query(args)
            } catch (err: any) {
              if (!isTransientError(err) || attempt === MAX_RETRIES) throw err
              // Exponential backoff before retry
              await new Promise(r => setTimeout(r, BASE_DELAY_MS * attempt))
              // Only call $connect() — never $disconnect() on the shared singleton.
              // Calling $disconnect() would drop all in-flight requests for other
              // concurrent callers (e.g., login while WhatsApp save retries P1017).
              // Prisma's pool handles individual MySQL reconnections automatically;
              // $connect() is only needed when the native engine binary itself died.
              await base.$connect().catch(() => {})
            }
          }
          return query(args) // unreachable — satisfies TypeScript
        },
      },
    },
  })
}

type DbClient = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: DbClient | undefined
}

export const db: DbClient =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
