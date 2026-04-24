// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Seeded Pseudo-Random Number Generator
// Ensures deterministic seed data across all environments
// Uses Xorshift32 algorithm with a fixed seed
// ═══════════════════════════════════════════════════════════════

const SEED = 20260425 // Fixed seed for reproducibility
let state = SEED

/** Returns a deterministic pseudo-random number in [0, 1) */
export function seededRandom(): number {
  // Xorshift32
  state ^= state << 13
  state ^= state >> 17
  state ^= state << 5
  return (state >>> 0) / 0xFFFFFFFF
}

/** Returns a deterministic random integer in [min, max] (inclusive) */
export function randomInt(min: number, max: number): number {
  return Math.floor(seededRandom() * (max - min + 1)) + min
}

/** Returns a deterministic random element from an array */
export function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}

/**
 * Returns a deterministic random Date between start and end.
 * For backward compatibility with randomDate(daysBack), use:
 *   randomDate(new Date(now - daysBack * 86400000), new Date())
 */
export function randomDate(start: Date, end: Date): Date {
  const diff = end.getTime() - start.getTime()
  const randomDiff = seededRandom() * diff
  return new Date(start.getTime() + randomDiff)
}

/** Convenience: random date N days back from a fixed reference point */
export function randomDaysBack(daysBack: number, referenceDate?: Date): Date {
  const ref = referenceDate || new Date('2026-04-25T12:00:00.000Z')
  return new Date(ref.getTime() - seededRandom() * daysBack * 86400000)
}

/** Reset the PRNG state (for testing) */
export function resetState(seed?: number): void {
  state = seed ?? SEED
}
