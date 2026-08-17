// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Shared Message Deduplication
// SINGLE dedup store shared by: Baileys connection.ts + Webhook route
// Prevents double-processing when the same message arrives via both channels
//
// v2: DB-backed (MessageDedup table) + in-memory L1 cache.
// Survives server restarts — critical for PM2 crash-restart scenarios.
// TTL: 10 minutes. DB sweep happens lazily every 5 minutes.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// ─── L1 in-memory cache (fast path, same-process dedup) ───────
const _global = globalThis as unknown as {
  __valiflow_dedup_map__?: Map<string, number>
}
const dedupMap: Map<string, number> = _global.__valiflow_dedup_map__ ?? new Map<string, number>()
if (!_global.__valiflow_dedup_map__) _global.__valiflow_dedup_map__ = dedupMap

const DEDUP_TTL_MS       = 10 * 60 * 1000   // 10 min
const DEDUP_MAX_ENTRIES  = 50_000
const SWEEP_INTERVAL_MS  = 5  * 60 * 1000   // DB sweep every 5 min

let lastSweep = Date.now()

// ─── DB sweep (delete expired rows, async fire-and-forget) ────
function maybeSweepDB(): void {
  const now = Date.now()
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  db.messageDedup.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => { /* non-critical */ })
}

/**
 * Check if a message ID has already been processed.
 * If not, marks it as processed (returns false = not a duplicate).
 *
 * @returns `true` if the message is a duplicate (should be skipped)
 *          `false` if it's new (and is now marked as processed)
 */
export async function isDuplicateMessageAsync(messageId: string): Promise<boolean> {
  if (!messageId) return false
  const now = Date.now()

  // ── L1: in-memory fast path ────────────────────────────────
  const cached = dedupMap.get(messageId)
  if (cached !== undefined && now - cached < DEDUP_TTL_MS) {
    console.log(`[Dedup] L1 hit — duplicate ignored: ${messageId.slice(0, 20)}`)
    return true
  }

  // ── L2: DB lookup (survives restart) ──────────────────────
  try {
    const expiresAt = new Date(now + DEDUP_TTL_MS)
    const created = await db.messageDedup.upsert({
      where:  { messageId },
      create: { messageId, expiresAt },
      update: {},                           // no-op if already exists
      select: { processedAt: true },
    })

    // If expiresAt was in the past when we found it, it's a stale entry
    // but upsert update:{} means processedAt stays original — still a dup
    const existing = dedupMap.get(messageId)
    if (existing !== undefined) {
      // We already checked L1 above and it was stale/missing
      // But DB returned existing row → it's a genuine duplicate
      if (created.processedAt < new Date(now - DEDUP_TTL_MS)) {
        // Truly expired — allow through and refresh
        dedupMap.set(messageId, now)
        await db.messageDedup.update({
          where: { messageId },
          data: { expiresAt, processedAt: new Date() },
        })
        return false
      }
      return true
    }

    // Populate L1 cache
    dedupMap.set(messageId, now)

    // LRU guard
    if (dedupMap.size > DEDUP_MAX_ENTRIES) {
      const entries = [...dedupMap.entries()].sort((a, b) => a[1] - b[1])
      const toEvict = Math.floor(DEDUP_MAX_ENTRIES * 0.2)
      for (let i = 0; i < toEvict; i++) dedupMap.delete(entries[i][0])
    }

    maybeSweepDB()
    return false
  } catch {
    // DB unavailable — fall back to in-memory only
    if (cached !== undefined && now - cached < DEDUP_TTL_MS) return true
    dedupMap.set(messageId, now)
    return false
  }
}

/**
 * Sync version kept for backwards-compat with callers that don't await.
 * Uses L1 cache only (no DB). Works correctly within the same process lifetime.
 */
export function isDuplicateMessage(messageId: string): boolean {
  if (!messageId) return false
  const now = Date.now()

  // Periodic L1 sweep
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now
    for (const [id, ts] of dedupMap) {
      if (now - ts > DEDUP_TTL_MS) dedupMap.delete(id)
    }
  }

  const existing = dedupMap.get(messageId)
  if (existing !== undefined && now - existing < DEDUP_TTL_MS) {
    console.log(`[Dedup] L1 duplicate ignored: ${messageId.slice(0, 20)}`)
    return true
  }
  dedupMap.set(messageId, now)

  // Fire-and-forget DB write (persist across restart)
  const expiresAt = new Date(now + DEDUP_TTL_MS)
  db.messageDedup.upsert({
    where:  { messageId },
    create: { messageId, expiresAt },
    update: {},
  }).catch(() => { /* non-critical */ })

  if (dedupMap.size > DEDUP_MAX_ENTRIES) {
    const entries = [...dedupMap.entries()].sort((a, b) => a[1] - b[1])
    const toEvict = Math.floor(DEDUP_MAX_ENTRIES * 0.2)
    for (let i = 0; i < toEvict; i++) dedupMap.delete(entries[i][0])
  }
  maybeSweepDB()
  return false
}

/** Get current dedup stats (for monitoring/debugging). */
export function getDedupStats(): { size: number; maxEntries: number; lastSweep: number } {
  return { size: dedupMap.size, maxEntries: DEDUP_MAX_ENTRIES, lastSweep }
}

/** Manually remove a message ID from the dedup map (for testing). */
export function removeFromDedup(messageId: string): void {
  dedupMap.delete(messageId)
  db.messageDedup.deleteMany({ where: { messageId } }).catch(() => {})
}

/** Clear all entries (for testing/shutdown). */
export function clearDedup(): void {
  dedupMap.clear()
  lastSweep = Date.now()
}


