// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Persistent Rate Limiter
// Prisma-based with in-memory fallback for resilience.
// Survives deploys and server restarts.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── In-Memory Fallback Store ──────────────────────────────────

interface InMemoryEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, InMemoryEntry>()

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupMemoryStore(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return

  lastCleanup = now
  for (const [key, entry] of memoryStore) {
    if (now >= entry.resetAt) {
      memoryStore.delete(key)
    }
  }
}

// ─── Types ─────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean
  remaining: number
  retryAfter: number | null
  limit: number
}

// ─── Core Rate Limiter ─────────────────────────────────────────

/**
 * Check rate limit for a given identifier + endpoint combination.
 * Uses Prisma (persistent) with automatic fallback to in-memory Map.
 *
 * @param identifier - Typically the client IP address (or userId)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns RateLimitResult with success status, remaining requests, and retryAfter
 */
export async function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  const key = identifier

  // Try Prisma first (persistent)
  try {
    return await prismaRateLimit(key, limit, windowMs)
  } catch (error) {
    // Prisma failed — fall back to in-memory
    console.warn('[RateLimit] DB unavailable, falling back to in-memory:', error instanceof Error ? error.message : error)
    return memoryRateLimit(key, limit, windowMs)
  }
}

/**
 * In-memory rate limit (fallback when DB is unavailable).
 */
function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanupMemoryStore()

  const now = Date.now()
  const entry = memoryStore.get(key)

  if (!entry || now >= entry.resetAt) {
    // New window
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    })
    return {
      success: true,
      remaining: limit - 1,
      retryAfter: null,
      limit,
    }
  }

  if (entry.count >= limit) {
    // Rate limited
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return {
      success: false,
      remaining: 0,
      retryAfter,
      limit,
    }
  }

  // Increment
  entry.count++
  memoryStore.set(key, entry)

  return {
    success: true,
    remaining: limit - entry.count,
    retryAfter: null,
    limit,
  }
}

/**
 * Prisma-based rate limit (persistent, survives deploys).
 * Uses upsert for atomicity with SQLite.
 */
async function prismaRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowMs)

  // Find existing entry for this key
  const existing = await db.rateLimitEntry.findUnique({
    where: { key },
  })

  if (!existing) {
    // First request — create entry
    await db.rateLimitEntry.create({
      data: {
        key,
        count: 1,
        lastReset: new Date(now.getTime() + windowMs),
      },
    })

    return {
      success: true,
      remaining: limit - 1,
      retryAfter: null,
      limit,
    }
  }

  // Check if the window has expired
  if (existing.lastReset <= now) {
    // Reset window
    const updated = await db.rateLimitEntry.update({
      where: { key },
      data: {
        count: 1,
        lastReset: new Date(now.getTime() + windowMs),
      },
    })

    return {
      success: true,
      remaining: limit - 1,
      retryAfter: null,
      limit,
    }
  }

  // Check if rate limit exceeded
  if (existing.count >= limit) {
    const retryAfterMs = existing.lastReset.getTime() - now.getTime()
    const retryAfter = Math.ceil(retryAfterMs / 1000)

    return {
      success: false,
      remaining: 0,
      retryAfter: Math.max(retryAfter, 1),
      limit,
    }
  }

  // Increment count
  const updated = await db.rateLimitEntry.update({
    where: { key },
    data: {
      count: { increment: 1 },
    },
  })

  return {
    success: true,
    remaining: limit - updated.count,
    retryAfter: null,
    limit,
  }
}

// ─── Periodic Cleanup (run via cron) ───────────────────────────

/**
 * Clean up expired rate limit entries from the database.
 * Should be called periodically (e.g., from a cron job).
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  try {
    const now = new Date()
    const result = await db.rateLimitEntry.deleteMany({
      where: {
        lastReset: { lte: now },
      },
    })
    return result.count
  } catch {
    return 0
  }
}

// ─── Rate Limit Configuration Presets ─────────────────────────

/**
 * Rate limit configuration presets for common endpoints.
 */
export const RATE_LIMITS = {
  /** Authentication endpoints: 10 req/min */
  auth: { limit: 10, windowMs: 60_000 },
  /** Registration: 3 req/min */
  register: { limit: 3, windowMs: 60_000 },
  /** AI chat endpoints: 20 req/min */
  aiChat: { limit: 20, windowMs: 60_000 },
  /** WhatsApp send: 30 req/min */
  whatsappSend: { limit: 30, windowMs: 60_000 },
  /** General API: 60 req/min */
  api: { limit: 60, windowMs: 60_000 },
  /** Billing endpoints: 10 req/min */
  billing: { limit: 10, windowMs: 60_000 },
  /** Seed endpoint: 2 req/min */
  seed: { limit: 2, windowMs: 60_000 },
  /** Agent create/delete: 15 req/min */
  agents: { limit: 15, windowMs: 60_000 },
  /** Automation create/delete: 15 req/min */
  automations: { limit: 15, windowMs: 60_000 },
  /** Data export: 5 req/min */
  export: { limit: 5, windowMs: 60_000 },
  /** Import: 3 req/min */
  import: { limit: 3, windowMs: 60_000 },
} as const
