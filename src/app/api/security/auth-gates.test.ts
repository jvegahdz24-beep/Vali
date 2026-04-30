// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Security Tests: Auth Gates
// Tests that protected endpoints correctly reject unauthorized access
//
// Covers P2 fixes: debug/system (production auth), cron/follow-ups,
//   followups/worker (secret enforcement)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Helper: create a fake Request
function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as any
}

// ─── Mock next/headers for debug/system tests ─────────────────
// The debug/system route calls cookies() directly from next/headers
// We need to control what cookies() returns

let mockCookieValue: string | null = null

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        if (name === 'valiflow-session' && mockCookieValue) {
          return { name: 'valiflow-session', value: mockCookieValue }
        }
        return undefined
      },
    }),
}))

// ═══════════════════════════════════════════════════════════
// 4. GET /api/debug/system — P2 FIX
//    Previously public (no auth) — exposed DB stats, env vars, etc.
//    Now requires authentication in production (NODE_ENV=production)
// ═══════════════════════════════════════════════════════════

describe('GET /api/debug/system (P2 fix)', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    mockCookieValue = null
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    // Clear module cache so dynamic import re-evaluates NODE_ENV
    vi.resetModules()
  })

  it('should allow access in development without auth (200)', async () => {
    process.env.NODE_ENV = 'development'
    // Dynamic import after setting NODE_ENV
    const mod = await import('@/app/api/debug/system/route')
    const res = await mod.GET()

    // In dev mode, auth is NOT required
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('components')
  })

  it('should reject unauthenticated requests in production (401)', async () => {
    process.env.NODE_ENV = 'production'
    mockCookieValue = null // No session cookie

    const mod = await import('@/app/api/debug/system/route')
    const res = await mod.GET()

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.code).toBe('AUTH_REQUIRED')
  })

  it('should reject invalid session token in production (401)', async () => {
    process.env.NODE_ENV = 'production'
    mockCookieValue = 'invalid.jwt.token'

    const mod = await import('@/app/api/debug/system/route')
    const res = await mod.GET()

    expect(res.status).toBe(401)
  })

  it('should include system components in response', async () => {
    process.env.NODE_ENV = 'development'
    const mod = await import('@/app/api/debug/system/route')
    const res = await mod.GET()

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.components).toHaveProperty('server')
    expect(data.components).toHaveProperty('database')
    expect(data.components).toHaveProperty('environment')
  })
})

// ═══════════════════════════════════════════════════════════
// 5. GET /api/cron/follow-ups — P2 FIX
//    Previously: if (!cronSecret) return true — open when not configured
//    Now: if (!cronSecret) return false — deny by default in production
//    Also upgraded to timing-safe comparison
// ═══════════════════════════════════════════════════════════

describe('GET /api/cron/follow-ups (P2 fix)', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    process.env.CRON_SECRET = originalCronSecret
    vi.resetModules()
  })

  it('should allow access in development without auth', async () => {
    process.env.NODE_ENV = 'development'
    process.env.CRON_SECRET = ''

    const mod = await import('@/app/api/cron/follow-ups/route')
    const req = createRequest('http://localhost/api/cron/follow-ups')
    const res = await mod.GET(req)

    // In dev mode, isAuthorized returns true regardless
    expect(res.status).toBe(200)
  })

  it('should deny access in production without CRON_SECRET env (401)', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CRON_SECRET = '' // No secret configured

    const mod = await import('@/app/api/cron/follow-ups/route')
    const req = createRequest('http://localhost/api/cron/follow-ups')
    const res = await mod.GET(req)

    // Without CRON_SECRET, should deny (FIX: was return true, now return false)
    expect(res.status).toBe(401)
  })

  it('should deny access in production with wrong secret (401)', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CRON_SECRET = 'the-real-cron-secret'

    const mod = await import('@/app/api/cron/follow-ups/route')
    const req = createRequest('http://localhost/api/cron/follow-ups', {
      headers: {
        authorization: 'Bearer wrong-secret-value',
      },
    })
    const res = await mod.GET(req)

    expect(res.status).toBe(401)
  })

  it('should allow access with correct Bearer token', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CRON_SECRET = 'test-cron-secret-2026'

    const mod = await import('@/app/api/cron/follow-ups/route')
    const req = createRequest('http://localhost/api/cron/follow-ups', {
      headers: {
        authorization: 'Bearer test-cron-secret-2026',
      },
    })
    const res = await mod.GET(req)

    // 200 or 404 (no active workspace) — but NOT 401
    expect(res.status).not.toBe(401)
  })

  it('should allow access with correct X-Cron-Secret header', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CRON_SECRET = 'test-cron-secret-2026'

    const mod = await import('@/app/api/cron/follow-ups/route')
    const req = createRequest('http://localhost/api/cron/follow-ups', {
      headers: {
        'x-cron-secret': 'test-cron-secret-2026',
      },
    })
    const res = await mod.GET(req)

    // 200 or 404 — but NOT 401
    expect(res.status).not.toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════
// 6. POST /api/followups/worker — P2 FIX
//    Previously: WORKER_KEY defaulted to hardcoded 'valiflow-worker-2024'
//    Now: no fallback — requires WORKER_KEY env var in production
// ═══════════════════════════════════════════════════════════

describe('POST /api/followups/worker (P2 fix)', () => {
  const originalWorkerKey = process.env.WORKER_KEY

  afterEach(() => {
    process.env.WORKER_KEY = originalWorkerKey
    vi.resetModules()
  })

  it('should deny access without X-Worker-Key header (401)', async () => {
    process.env.WORKER_KEY = 'test-worker-key-2026'

    const mod = await import('@/app/api/followups/worker/route')
    const req = createRequest('http://localhost/api/followups/worker', {
      method: 'POST',
    })
    const res = await mod.POST(req)

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.code).toBe('INVALID_WORKER_KEY')
  })

  it('should deny access with wrong key (401)', async () => {
    process.env.WORKER_KEY = 'test-worker-key-2026'

    const mod = await import('@/app/api/followups/worker/route')
    const req = createRequest('http://localhost/api/followups/worker', {
      method: 'POST',
      headers: {
        'x-worker-key': 'wrong-key-value',
      },
    })
    const res = await mod.POST(req)

    expect(res.status).toBe(401)
  })

  it('should deny access when WORKER_KEY is not configured (401)', async () => {
    process.env.WORKER_KEY = '' // Empty — no fallback

    const mod = await import('@/app/api/followups/worker/route')
    const req = createRequest('http://localhost/api/followups/worker', {
      method: 'POST',
      headers: {
        'x-worker-key': 'any-value',
      },
    })
    const res = await mod.POST(req)

    // FIX: Previously would accept 'valiflow-worker-2024', now denies
    expect(res.status).toBe(401)
  })

  it('should allow access with correct worker key (200)', async () => {
    process.env.WORKER_KEY = 'test-worker-key-2026'

    const mod = await import('@/app/api/followups/worker/route')
    const req = createRequest('http://localhost/api/followups/worker', {
      method: 'POST',
      headers: {
        'x-worker-key': 'test-worker-key-2026',
      },
    })
    const res = await mod.POST(req)

    // 200 (success, no pending tasks) — NOT 401
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data).toHaveProperty('processed')
    expect(data).toHaveProperty('sent')
  })

  it('should support GET for status check with correct key', async () => {
    process.env.WORKER_KEY = 'test-worker-key-2026'

    const mod = await import('@/app/api/followups/worker/route')
    const req = createRequest('http://localhost/api/followups/worker', {
      headers: {
        'x-worker-key': 'test-worker-key-2026',
      },
    })
    const res = await mod.GET(req)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data).toHaveProperty('queue')
  })

  it('should deny GET without worker key (401)', async () => {
    process.env.WORKER_KEY = 'test-worker-key-2026'

    const mod = await import('@/app/api/followups/worker/route')
    const req = createRequest('http://localhost/api/followups/worker')
    const res = await mod.GET(req)

    expect(res.status).toBe(401)
  })
})
