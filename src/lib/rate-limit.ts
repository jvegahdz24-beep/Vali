// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — In-Memory Rate Limiter
// Simple sliding-window rate limiter with TTL cleanup
// ═══════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number
  resetAt: number
}

// Store: Map<ip:endpoint, RateLimitEntry>
const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return

  lastCleanup = now
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key)
    }
  }
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  retryAfter: number | null
  limit: number
}

/**
 * Check rate limit for a given identifier + endpoint combination.
 *
 * @param identifier - Typically the client IP address
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns RateLimitResult with success status, remaining requests, and retryAfter
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number = 60_000
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const key = `${identifier}`

  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    // New window
    store.set(key, {
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
  store.set(key, entry)

  return {
    success: true,
    remaining: limit - entry.count,
    retryAfter: null,
    limit,
  }
}

/**
 * Rate limit configuration presets for common endpoints
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
  /** Seed endpoint: 2 req/min */
  seed: { limit: 2, windowMs: 60_000 },
} as const
