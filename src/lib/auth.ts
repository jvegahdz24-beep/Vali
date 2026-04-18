// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Auth Module (Node.js Runtime)
// Used by API routes — safe to import bcryptjs here
// Re-exports JWT functions from auth-edge for convenience
// ═══════════════════════════════════════════════════════════════

import bcrypt from 'bcryptjs'

// Re-export edge-compatible JWT functions
export { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from './auth-edge'
export type { SessionPayload } from './auth-edge'

// ─── Password Operations (Node.js only) ──────────────────────

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

/**
 * Compare a plain-text password against a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
