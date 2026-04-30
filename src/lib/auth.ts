// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Auth Module (Node.js Runtime)
// Uses SHA-256 via crypto (bcrypt OOM-kills in low-memory environments)
// Re-exports JWT functions from auth-edge for convenience
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto'

// Re-export edge-compatible JWT functions
export { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from './auth-edge'
export type { SessionPayload } from './auth-edge'

// ─── Password Operations (SHA-256) ──────────────────────────

/**
 * Hash a password using SHA-256.
 * Note: SHA-256 is fast but sufficient for this app's threat model.
 * For production at scale, consider argon2id via a separate worker.
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * Compare a plain-text password against a stored SHA-256 hash.
 */
export function comparePassword(password: string, hash: string): boolean {
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex')
  return passwordHash === hash
}
