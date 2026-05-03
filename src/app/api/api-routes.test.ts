import { describe, it, expect } from 'vitest'

// Test API route handlers by importing the route modules
// These test the handler functions directly without making HTTP calls

describe('API: Health Check', () => {
  it('should export a GET function', async () => {
    const mod = await import('@/app/api/health/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Auth Login', () => {
  it('should export a POST function', async () => {
    const mod = await import('@/app/api/auth/login/route')
    expect(typeof mod.POST).toBe('function')
  })

  it('should reject invalid credentials with 401', async () => {
    const mod = await import('@/app/api/auth/login/route')
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@test.com', password: 'wrong' }),
    }) as any
    const res = await mod.POST(req)
    expect(res.status).toBe(401)
  })
})

describe('API: Auth Register', () => {
  it('should export a POST function', async () => {
    const mod = await import('@/app/api/auth/register/route')
    expect(typeof mod.POST).toBe('function')
  })
})

describe('API: Contacts', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/contacts/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Deals', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/deals/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Conversations', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/conversations/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: JHON Panel (Engine)', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/jhon-panel/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Dashboard Stats', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/dashboard/stats/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Actions (Engine)', () => {
  it('should export POST function', async () => {
    const mod = await import('@/app/api/actions/route')
    expect(typeof mod.POST).toBe('function')
  })
})

describe('API: Seed', () => {
  it('should export GET and POST functions', async () => {
    const mod = await import('@/app/api/seed/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })

  it('GET should return error without auth (protected endpoint)', async () => {
    const mod = await import('@/app/api/seed/route')
    const req = new Request('http://localhost/api/seed') as any
    const res = await mod.GET(req)
    expect([401, 500]).toContain(res.status)
  })
})

describe('API: Analytics', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/analytics/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Pipeline', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/pipeline/route')
    expect(typeof mod.GET).toBe('function')
  })
})

describe('API: Engine Cron', () => {
  it('should export GET function', async () => {
    const mod = await import('@/app/api/engine/cron/route')
    expect(typeof mod.GET).toBe('function')
  })
})
