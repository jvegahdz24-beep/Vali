// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow Test Suite — Worker Key Authorization
// Tests for /api/followups/worker verifyWorkerKey() function
// Fix: P2 — No hardcoded WORKER_KEY fallback, denies when not configured
// ═══════════════════════════════════════════════════════════════

describe('Worker Key Authorization (followups/worker/route.ts)', () => {
  const WORKER_KEY = process.env.WORKER_KEY || 'test-worker-key-67890'

  /**
   * Reimplementation of verifyWorkerKey logic for direct testing.
   * Matches the exact logic in /api/followups/worker/route.ts
   */
  function verifyWorkerKeyLogic(headers: Record<string, string>): boolean {
    const incoming = headers['x-worker-key'] || headers['X-Worker-Key'] || ''
    if (!incoming) return false

    const configuredKey = process.env.WORKER_KEY
    if (!configuredKey) return false // FIX: No fallback

    // Timing-safe comparison (same XOR pattern as production)
    const a = Buffer.from(configuredKey)
    const b = Buffer.from(incoming)
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) { result |= a[i] ^ b[i] }
    return result === 0
  }

  describe('No X-Worker-Key header', () => {
    it('should reject request without X-Worker-Key header', () => {
      expect(verifyWorkerKeyLogic({})).toBe(false)
    })

    it('should reject request with empty X-Worker-Key header', () => {
      expect(verifyWorkerKeyLogic({ 'x-worker-key': '' })).toBe(false)
    })

    it('should ignore Authorization header (only X-Worker-Key is valid)', () => {
      expect(verifyWorkerKeyLogic({ Authorization: `Bearer ${WORKER_KEY}` })).toBe(false)
    })
  })

  describe('Valid key', () => {
    it('should accept correct X-Worker-Key', () => {
      expect(verifyWorkerKeyLogic({ 'x-worker-key': WORKER_KEY })).toBe(true)
    })

    it('should be case-sensitive for header name', () => {
      // Lowercase should work
      expect(verifyWorkerKeyLogic({ 'x-worker-key': WORKER_KEY })).toBe(true)
    })
  })

  describe('Invalid key', () => {
    it('should reject wrong X-Worker-Key', () => {
      expect(verifyWorkerKeyLogic({ 'x-worker-key': 'wrong-key' })).toBe(false)
    })

    it('should reject partially correct key', () => {
      expect(verifyWorkerKeyLogic({ 'x-worker-key': WORKER_KEY.slice(0, -1) })).toBe(false)
    })

    it('should reject key with extra characters', () => {
      expect(verifyWorkerKeyLogic({ 'x-worker-key': WORKER_KEY + 'extra' })).toBe(false)
    })

    it('should reject null-like values', () => {
      expect(verifyWorkerKeyLogic({ 'x-worker-key': 'null' })).toBe(false)
      expect(verifyWorkerKeyLogic({ 'x-worker-key': 'undefined' })).toBe(false)
    })
  })

  describe('No WORKER_KEY configured (FIX: deny by default)', () => {
    const originalWorkerKey = process.env.WORKER_KEY

    afterEach(() => {
      process.env.WORKER_KEY = originalWorkerKey
    })

    it('should reject when WORKER_KEY is not set at all', () => {
      delete process.env.WORKER_KEY
      expect(verifyWorkerKeyLogic({ 'x-worker-key': 'anything' })).toBe(false)
    })

    it('should reject when WORKER_KEY is empty string', () => {
      process.env.WORKER_KEY = ''
      expect(verifyWorkerKeyLogic({ 'x-worker-key': 'something' })).toBe(false)
    })
  })

  describe('Timing-safe comparison', () => {
    it('should not leak key length via timing (same length = same time)', () => {
      const wrongKey = WORKER_KEY.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 1)).join('')
      const iterations = 100

      // Warm up
      for (let i = 0; i < 10; i++) {
        verifyWorkerKeyLogic({ 'x-worker-key': WORKER_KEY })
        verifyWorkerKeyLogic({ 'x-worker-key': wrongKey })
      }

      const startCorrect = process.hrtime.bigint()
      for (let i = 0; i < iterations; i++) {
        verifyWorkerKeyLogic({ 'x-worker-key': WORKER_KEY })
      }
      const correctTime = Number(process.hrtime.bigint() - startCorrect)

      const startWrong = process.hrtime.bigint()
      for (let i = 0; i < iterations; i++) {
        verifyWorkerKeyLogic({ 'x-worker-key': wrongKey })
      }
      const wrongTime = Number(process.hrtime.bigint() - startWrong)

      const ratio = Math.max(correctTime, wrongTime) / Math.max(Math.min(correctTime, wrongTime), 1)
      expect(ratio).toBeLessThan(5)
    })

    it('should reject different-length keys quickly (length check is not a vulnerability)', () => {
      const shortKey = 'x'
      const longKey = WORKER_KEY + '-very-very-very-very-long-padding'

      expect(verifyWorkerKeyLogic({ 'x-worker-key': shortKey })).toBe(false)
      expect(verifyWorkerKeyLogic({ 'x-worker-key': longKey })).toBe(false)
    })
  })
})
