import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendEmail, sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail, isEmailConfigured } from '@/lib/email'

// Test email service (mock Resend API)
describe('Email Service', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  describe('isEmailConfigured', () => {
    it('should return false when RESEND_API_KEY is empty', () => {
      expect(isEmailConfigured()).toBe(false)
    })
  })

  describe('sendEmail', () => {
    it('should succeed gracefully when RESEND_API_KEY is not set', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      })
      expect(result.success).toBe(true)
    })

    it('should return success:true and not throw when API key is missing', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Hello</h1>',
      })
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('sendWelcomeEmail', () => {
    it('should return success when email is not configured', async () => {
      const result = await sendWelcomeEmail('test@example.com', 'Juan')
      expect(result.success).toBe(true)
    })

    it('should work without a name parameter', async () => {
      const result = await sendWelcomeEmail('test@example.com')
      expect(result.success).toBe(true)
    })
  })

  describe('sendPasswordResetEmail', () => {
    it('should return success when email is not configured', async () => {
      const result = await sendPasswordResetEmail({
        email: 'test@example.com',
        token: 'reset-token-123',
        name: 'Maria',
      })
      expect(result.success).toBe(true)
    })

    it('should work without a name parameter', async () => {
      const result = await sendPasswordResetEmail({
        email: 'test@example.com',
        token: 'token-abc',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('sendVerificationEmail', () => {
    it('should return success when email is not configured', async () => {
      const result = await sendVerificationEmail({
        email: 'test@example.com',
        token: 'verify-token-456',
        name: 'Carlos',
      })
      expect(result.success).toBe(true)
    })
  })
})
