// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Test Utilities
// Helpers for creating test data, JWT tokens, and mock requests
// ═══════════════════════════════════════════════════════════════

import { createSessionToken, verifySessionToken, type SessionPayload } from '@/lib/auth-edge'

// ─── JWT Token Generation ─────────────────────────────────────

/**
 * Create a valid JWT session token for testing.
 * Uses the real auth-edge module with the test NEXTAUTH_SECRET.
 */
export async function generateTestToken(overrides: Partial<SessionPayload> = {}): Promise<string> {
  const payload: SessionPayload = {
    userId: 'test-user-id',
    email: 'test@valiflow.com',
    name: 'Test User',
    role: 'owner',
    workspaceId: 'test-workspace-id',
    ...overrides,
  }
  return createSessionToken(payload)
}

/**
 * Create an expired JWT token (for testing expiration handling).
 */
export async function generateExpiredToken(overrides: Partial<SessionPayload> = {}): Promise<string> {
  const { TextEncoder } = await import('util' as any) || { TextEncoder }
  // We need to manually craft an expired token since createSessionToken always creates valid ones
  // We'll use the same secret but set exp to the past
  const crypto = await import('crypto')
  const encoder = new TextEncoder()

  const header = { alg: 'HS256', typ: 'JWT' }
  const headerBytes = encoder.encode(JSON.stringify(header))
  const headerB64 = Buffer.from(headerBytes).toString('base64url')

  const payload: Record<string, unknown> = {
    userId: 'test-user-id',
    email: 'test@valiflow.com',
    name: 'Test User',
    role: 'owner',
    workspaceId: 'test-workspace-id',
    ...overrides,
    iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    exp: Math.floor(Date.now() / 1000) - 1800, // expired 30 min ago
  }
  const payloadBytes = encoder.encode(JSON.stringify(payload))
  const payloadB64 = Buffer.from(payloadBytes).toString('base64url')

  const signingInput = `${headerB64}.${payloadB64}`
  const signingInputBytes = encoder.encode(signingInput)

  const secret = process.env.NEXTAUTH_SECRET || 'test-secret-do-not-use-in-prod-32chars!!'
  const key = crypto.createHmac('sha256', secret)
  key.update(signingInputBytes)
  const signature = key.digest()
  const signatureB64 = Buffer.from(signature).toString('base64url')

  return `${signingInput}.${signatureB64}`
}

/**
 * Verify a test token — thin wrapper for readability.
 */
export async function verifyTestToken(token: string): Promise<SessionPayload | null> {
  return verifySessionToken(token)
}

// ─── Cookie Header Construction ───────────────────────────────

/**
 * Build a Cookie header string with the valiflow-session token.
 */
export function buildCookieHeader(token: string): string {
  return `valiflow-session=${token}`
}

// ─── Test IDs (deterministic for readability) ─────────────────

export const TEST_IDS = {
  user1: 'usr_test_owner_w1',
  user2: 'usr_test_member_w1',
  user3: 'usr_test_owner_w2', // Different workspace
  workspace1: 'ws_test_alpha',
  workspace2: 'ws_test_beta',
  contactW1: 'cnt_w1_contact1',
  contactW2: 'cnt_w2_contact1',
  conversationW1: 'cnv_w1_conv1',
  conversationW2: 'cnv_w2_conv1',
  messageW1: 'msg_w1_msg1',
  messageW2: 'msg_w2_msg1',
  dealW1: 'deal_w1_deal1',
  agentW1: 'agt_w1_agent1',
} as const

// ─── Session Factory ──────────────────────────────────────────

export interface TestSession {
  token: string
  cookieHeader: string
  payload: SessionPayload
}

/**
 * Create a complete test session (token + cookie header + payload).
 */
export async function createTestSession(overrides: Partial<SessionPayload> = {}): Promise<TestSession> {
  const token = await generateTestToken(overrides)
  const payload = { ...{ userId: 'test-user-id', email: 'test@valiflow.com', name: 'Test User', role: 'owner' }, ...overrides } as SessionPayload
  return {
    token,
    cookieHeader: buildCookieHeader(token),
    payload,
  }
}

// ─── Auth Header Factory ──────────────────────────────────────

export function buildAuthHeader(type: 'bearer' | 'worker-key' | 'cron-secret', value: string): Record<string, string> {
  switch (type) {
    case 'bearer':
      return { Authorization: `Bearer ${value}` }
    case 'worker-key':
      return { 'X-Worker-Key': value }
    case 'cron-secret':
      return { 'X-Cron-Secret': value }
  }
}
