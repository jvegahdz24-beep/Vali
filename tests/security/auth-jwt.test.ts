// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — JWT Auth Module
// Tests for createSessionToken and verifySessionToken (auth-edge.ts)
// ═══════════════════════════════════════════════════════════════

import { createSessionToken, verifySessionToken } from '@/lib/auth-edge'
import { generateTestToken, generateExpiredToken, verifyTestToken } from '../setup/test-utils'

describe('JWT Auth Module (auth-edge.ts)', () => {
  // ─── Token Creation ─────────────────────────────────────────

  describe('createSessionToken', () => {
    it('should create a valid JWT token with 3 parts', async () => {
      const token = await createSessionToken({
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'owner',
      })
      const parts = token.split('.')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toBeTruthy() // header
      expect(parts[1]).toBeTruthy() // payload
      expect(parts[2]).toBeTruthy() // signature
    })

    it('should include all required fields in the payload', async () => {
      const token = await createSessionToken({
        userId: 'user-456',
        email: 'owner@example.com',
        name: 'Owner Name',
        role: 'admin',
        workspaceId: 'ws-789',
      })

      // Decode payload (base64url → JSON)
      const payloadB64 = token.split('.')[1]
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

      expect(payload.userId).toBe('user-456')
      expect(payload.email).toBe('owner@example.com')
      expect(payload.name).toBe('Owner Name')
      expect(payload.role).toBe('admin')
      expect(payload.workspaceId).toBe('ws-789')
      expect(payload.iat).toBeDefined()
      expect(payload.exp).toBeDefined()
    })

    it('should set expiration to 30 days from now', async () => {
      const token = await createSessionToken({
        userId: 'u1', email: 'e@e.com', name: 'T', role: 'member',
      })
      const payloadB64 = token.split('.')[1]
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

      const expectedExp = payload.iat + (30 * 24 * 60 * 60)
      expect(payload.exp).toBe(expectedExp)
    })

    it('should create tokens with different user roles', async () => {
      const roles = ['owner', 'admin', 'member', 'viewer'] as const
      for (const role of roles) {
        const token = await createSessionToken({
          userId: `user-${role}`,
          email: `${role}@test.com`,
          name: `User ${role}`,
          role,
        })
        expect(token.split('.')).toHaveLength(3)
      }
    })
  })

  // ─── Token Verification ─────────────────────────────────────

  describe('verifySessionToken', () => {
    it('should return payload for a valid token', async () => {
      const token = await createSessionToken({
        userId: 'verify-1',
        email: 'verify@test.com',
        name: 'Verify User',
        role: 'owner',
      })

      const payload = await verifySessionToken(token)
      expect(payload).not.toBeNull()
      expect(payload!.userId).toBe('verify-1')
      expect(payload!.email).toBe('verify@test.com')
      expect(payload!.name).toBe('Verify User')
      expect(payload!.role).toBe('owner')
    })

    it('should return null for a malformed token (missing parts)', async () => {
      const result = await verifySessionToken('not-a-jwt')
      expect(result).toBeNull()
    })

    it('should return null for a tampered payload', async () => {
      const token = await createSessionToken({
        userId: 'u1', email: 'e@e.com', name: 'T', role: 'member',
      })
      // Tamper with the payload
      const parts = token.split('.')
      parts[1] = Buffer.from(JSON.stringify({ userId: 'hacker', email: 'evil@test.com', name: 'Hacker', role: 'owner', iat: 123, exp: 9999999999 })).toString('base64url')
      const tampered = parts.join('.')

      const result = await verifySessionToken(tampered)
      expect(result).toBeNull()
    })

    it('should return null for an expired token', async () => {
      const token = await generateExpiredToken()
      const result = await verifySessionToken(token)
      expect(result).toBeNull()
    })

    it('should return null for an empty string', async () => {
      const result = await verifySessionToken('')
      expect(result).toBeNull()
    })

    it('should return null for a token with wrong secret', async () => {
      // Create token with one secret, verify with different module that uses a different secret
      // Since we can't easily change the secret at runtime, we test with a completely invalid signature
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZW1haWwiOiJ0QHQuY29tIiwibmFtZSI6IlQiLCJyb2xlIjoibWVtYmVyIiwiaWF0IjoxMjMsImV4cCI6OTk5OTk5OTk5OX0.invalidsignaturehere'
      const result = await verifySessionToken(token)
      expect(result).toBeNull()
    })
  })

  // ─── Test Utility Wrappers ──────────────────────────────────

  describe('Test Utilities', () => {
    it('generateTestToken should produce a verifiable token', async () => {
      const token = await generateTestToken({ userId: 'util-1', workspaceId: 'ws-1' })
      const payload = await verifyTestToken(token)
      expect(payload).not.toBeNull()
      expect(payload!.userId).toBe('util-1')
      expect(payload!.workspaceId).toBe('ws-1')
    })

    it('createTestSession should return token, cookie, and payload', async () => {
      const { createTestSession } = await import('../setup/test-utils')
      const session = await createTestSession({
        userId: 'session-1',
        email: 'session@test.com',
        role: 'admin',
        workspaceId: 'ws-session',
      })

      expect(session.token).toBeTruthy()
      expect(session.cookieHeader).toContain('valiflow-session=')
      expect(session.payload.userId).toBe('session-1')
      expect(session.payload.workspaceId).toBe('ws-session')

      // Verify the token is actually valid
      const verified = await verifyTestToken(session.token)
      expect(verified).not.toBeNull()
      expect(verified!.email).toBe('session@test.com')
    })
  })
})
