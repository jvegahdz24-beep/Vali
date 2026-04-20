// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Shared Message Deduplication
// SINGLE dedup store shared by: Baileys connection.ts + Webhook route
// Prevents double-processing when the same message arrives via both channels
//
// FIX P2+P5: Uses Map<string, number> for per-entry timestamps instead of
// bulk-clearing a Set. Individual eviction + periodic sweep every 120s.
// ═══════════════════════════════════════════════════════════════

// Persist across hot-reloads in dev mode via globalThis
const _global = globalThis as unknown as {
  __valiflow_dedup_map__?: Map<string, number>
}

// Singleton Map: messageId → timestamp of when it was added
const dedupMap: Map<string, number> = _global.__valiflow_dedup_map__ ?? new Map<string, number>()
if (!_global.__valiflow_dedup_map__) {
  _global.__valiflow_dedup_map__ = dedupMap
}

/** Time-to-live for dedup entries: 10 minutes */
const DEDUP_TTL_MS = 10 * 60 * 1000

/** Maximum entries before forced LRU eviction */
const DEDUP_MAX_ENTRIES = 50_000

/** Sweep interval: check for expired entries every 120s (not every check) */
const SWEEP_INTERVAL_MS = 120 * 1000

let lastSweep = Date.now()

/**
 * Check if a message ID has already been processed.
 * If not, marks it as processed (returns false = not a duplicate).
 *
 * @returns `true` if the message is a duplicate (should be skipped)
 *          `false` if it's new (and is now marked as processed)
 */
export function isDuplicateMessage(messageId: string): boolean {
  if (!messageId) return false

  const now = Date.now()

  // Periodic sweep: evict expired entries individually (not bulk clear)
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now
    let evicted = 0
    for (const [id, ts] of dedupMap) {
      if (now - ts > DEDUP_TTL_MS) {
        dedupMap.delete(id)
        evicted++
      }
    }
    if (evicted > 0) {
      console.log(`[Dedup] Sweep: evicted ${evicted} expired entries (remaining: ${dedupMap.size})`)
    }
  }

  // Check existing
  const existing = dedupMap.get(messageId)
  if (existing !== undefined) {
    // Still within TTL — it's a duplicate
    if (now - existing < DEDUP_TTL_MS) {
      console.log(`[Dedup] Duplicate ignored: ${messageId.slice(0, 20)}...`)
      return true
    }
    // Expired — remove stale entry and allow reprocessing
    dedupMap.delete(messageId)
  }

  // Mark as processed
  dedupMap.set(messageId, now)

  // LRU guard: if map grows too large, evict oldest 20%
  if (dedupMap.size > DEDUP_MAX_ENTRIES) {
    const entries = [...dedupMap.entries()].sort((a, b) => a[1] - b[1])
    const toEvict = Math.floor(DEDUP_MAX_ENTRIES * 0.2)
    for (let i = 0; i < toEvict; i++) {
      dedupMap.delete(entries[i][0])
    }
    console.log(`[Dedup] LRU eviction: removed ${toEvict} entries (remaining: ${dedupMap.size})`)
  }

  return false
}

/**
 * Get current dedup stats (for monitoring/debugging).
 */
export function getDedupStats(): { size: number; maxEntries: number; lastSweep: number } {
  return {
    size: dedupMap.size,
    maxEntries: DEDUP_MAX_ENTRIES,
    lastSweep,
  }
}

/**
 * Manually remove a message ID from the dedup map (for testing).
 */
export function removeFromDedup(messageId: string): void {
  dedupMap.delete(messageId)
}

/**
 * Clear all entries (for testing/shutdown).
 */
export function clearDedup(): void {
  dedupMap.clear()
  lastSweep = Date.now()
}
