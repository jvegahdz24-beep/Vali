// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Auth Module (Node.js Runtime)
// Uses bcryptjs for password hashing (salt + work factor = secure)
// Re-exports JWT functions from auth-edge for convenience
// ═══════════════════════════════════════════════════════════════

import bcrypt from 'bcryptjs'

// Re-export edge-compatible JWT functions (legacy)
export { createSessionToken, verifySessionToken } from './auth-edge'
export type { SessionPayload as EdgeSessionPayload } from './auth-edge'

// Re-export JWT auth functions from ./auth/ directory
export {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  revokeAccessToken,
  createTokenPair,
  revokeSession,
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from './auth/index'
export type { SessionPayload, TokenPair } from './auth/index'

// ─── Password Operations (bcrypt) ────────────────────────────

/**
 * Hash a password using bcrypt with 12 rounds of work factor.
 * Automatically generates a unique salt per password.
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12)
}

/**
 * Compare a plain-text password against a stored bcrypt hash.
 * Uses bcrypt's built-in constant-time comparison.
 */
export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}
