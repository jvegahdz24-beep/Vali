// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Auth Module (Node.js Runtime)
// Re-exports JWT functions from auth-edge for convenience.
// Password hashing (bcrypt) is handled directly in auth route handlers.
// ═══════════════════════════════════════════════════════════════

// Re-export edge-compatible JWT functions
export { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from './auth-edge'
export type { SessionPayload } from './auth-edge'
