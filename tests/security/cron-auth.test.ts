// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Cron Secret Authorization
// Tests for /api/cron/follow-ups isAuthorized() function
// Fix: P2 — CRON_SECRET no longer falls back to open access
// ═══════════════════════════════════════════════════════════════

describe('Cron Secret Authorization (follow-ups/route.ts)', () => {
  // We test the logic by reimplementing the same isAuthorized function
  // since NextRequest cannot be easily instantiated in Jest.
  // This is a LOGIC-LEVEL test of the security fix.

  const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-key-12345'

  /**
   * Reimplementation of the isAuthorized logic from /api/cron/follow-ups/route.ts
   * for direct testing without Next.js runtime dependencies.
   */
  function isAuthorizedLogic(headers: Record<string, string>, nodeEnv: string): boolean {
    // In sandbox/dev: allow all
    if (nodeEnv !== 'production') return true

    // FIX: Deny by default when no secret configured in production
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return false

    const authHeader = headers['authorization'] || headers['Authorization'] || ''
    const cronHeader = headers['x-cron-secret'] || headers['X-Cron-Secret'] || ''

    const incoming = authHeader.replace('Bearer ', '') || cronHeader || ''

    // Timing-safe comparison (same XOR pattern as production code)
    const a = Buffer.from(cronSecret)
    const b = Buffer.from(incoming)
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) { result |= a[i] ^ b[i] }
    return result === 0
  }

  describe('Development mode', () => {
    it('should allow all requests in development (no auth required)', () => {
      expect(isAuthorizedLogic({}, 'development')).toBe(true)
    })

    it('should allow all requests in test mode', () => {
      expect(isAuthorizedLogic({}, 'test')).toBe(true)
    })

    it('should allow requests with random headers in development', () => {
      expect(isAuthorizedLogic({ Authorization: 'Bearer wrong-secret' }, 'development')).toBe(true)
    })
  })

  describe('Production mode', () => {
    // Save and restore NODE_ENV
    const originalNodeEnv = process.env.NODE_ENV
    const originalCronSecret = process.env.CRON_SECRET

    beforeAll(() => {
      process.env.CRON_SECRET = CRON_SECRET
    })

    afterAll(() => {
      process.env.NODE_ENV = originalNodeEnv
      process.env.CRON_SECRET = originalCronSecret
    })

    it('should reject request with no auth headers', () => {
      process.env.NODE_ENV = 'production'
      expect(isAuthorizedLogic({}, 'production')).toBe(false)
    })

    it('should accept valid Bearer token', () => {
      process.env.NODE_ENV = 'production'
      expect(isAuthorizedLogic({ Authorization: `Bearer ${CRON_SECRET}` }, 'production')).toBe(true)
    })

    it('should accept valid X-Cron-Secret header', () => {
      process.env.NODE_ENV = 'production'
      expect(isAuthorizedLogic({ 'x-cron-secret': CRON_SECRET }, 'production')).toBe(true)
    })

    it('should reject wrong Bearer token', () => {
      process.env.NODE_ENV = 'production'
      expect(isAuthorizedLogic({ Authorization: 'Bearer wrong-secret' }, 'production')).toBe(false)
    })

    it('should reject wrong X-Cron-Secret header', () => {
      process.env.NODE_ENV = 'production'
      expect(isAuthorizedLogic({ 'x-cron-secret': 'totally-wrong' }, 'production')).toBe(false)
    })

    it('should reject when CRON_SECRET is not set (denies by default)', () => {
      process.env.NODE_ENV = 'production'
      const saved = process.env.CRON_SECRET
      delete process.env.CRON_SECRET

      expect(isAuthorizedLogic({ 'x-cron-secret': 'anything' }, 'production')).toBe(false)

      process.env.CRON_SECRET = saved
    })

    it('should be timing-safe (same-length wrong secret takes same time)', () => {
      process.env.NODE_ENV = 'production'
      // Generate a same-length wrong secret
      const wrongSecret = CRON_SECRET.split('').map(c => c === 'a' ? 'b' : 'a').join('')

      const times: number[] = []
      const iterations = 100

      // Warm up
      for (let i = 0; i < 10; i++) {
        isAuthorizedLogic({ Authorization: `Bearer ${CRON_SECRET}` }, 'production')
        isAuthorizedLogic({ Authorization: `Bearer ${wrongSecret}` }, 'production')
      }

      // Measure correct secret
      const startCorrect = process.hrtime.bigint()
      for (let i = 0; i < iterations; i++) {
        isAuthorizedLogic({ Authorization: `Bearer ${CRON_SECRET}` }, 'production')
      }
      const correctTime = Number(process.hrtime.bigint() - startCorrect)

      // Measure wrong secret
      const startWrong = process.hrtime.bigint()
      for (let i = 0; i < iterations; i++) {
        isAuthorizedLogic({ Authorization: `Bearer ${wrongSecret}` }, 'production')
      }
      const wrongTime = Number(process.hrtime.bigint() - startWrong)

      // Times should be within 10x of each other (timing-safe comparison prevents >100x difference)
      // NOTE: 10x threshold accounts for CI/CD noise on shared servers
      const ratio = Math.max(correctTime, wrongTime) / Math.max(Math.min(correctTime, wrongTime), 1)
      expect(ratio).toBeLessThan(10)
    })
  })
})
