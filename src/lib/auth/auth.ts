// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Password Hashing (Node.js Runtime)
// bcryptjs for secure password hashing (salt + work factor = 12)
// ═══════════════════════════════════════════════════════════════

import bcrypt from 'bcryptjs'

/**
 * Hash a password using bcrypt with 12 rounds of work factor.
 * Automatically generates a unique salt per password.
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12)
}

/**
 * Compare a plain-text password against a stored bcrypt hash.
 * Uses bcrypt's built-in constant-time comparison to prevent timing attacks.
 */
export function comparePassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}
