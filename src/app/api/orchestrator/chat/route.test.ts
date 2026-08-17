import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    code: string

    constructor(status: number, message: string, code: string) {
      super(message)
      this.status = status
      this.code = code
    }
  }

  return {
    MockApiError,
    requireAuth: vi.fn(),
    requireWorkspace: vi.fn(),
    requirePermission: vi.fn(),
    getClientIp: vi.fn(() => '127.0.0.1'),
    errorResponse: vi.fn((error: unknown) => {
      const value = error as { status?: number; code?: string; message?: string }
      return Response.json(
        { error: value.message || 'error', code: value.code || 'INTERNAL_ERROR' },
        { status: value.status || 500 },
      )
    }),
    rateLimit: vi.fn(),
    contactFindFirst: vi.fn(),
    processMessage: vi.fn(),
    getOrchestratorStats: vi.fn(),
  }
})

vi.mock('@/lib/api-auth', () => ({
  ApiError: mocks.MockApiError,
  requireAuth: mocks.requireAuth,
  requireWorkspace: mocks.requireWorkspace,
  requirePermission: mocks.requirePermission,
  getClientIp: mocks.getClientIp,
  errorResponse: mocks.errorResponse,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mocks.rateLimit(...args),
  RATE_LIMITS: { aiChat: { limit: 20, windowMs: 60_000 } },
}))

vi.mock('@/lib/db', () => ({
  db: { contact: { findFirst: (...args: unknown[]) => mocks.contactFindFirst(...args) } },
}))

vi.mock('@/lib/orchestrator', () => ({
  orchestrator: { processMessage: (...args: unknown[]) => mocks.processMessage(...args) },
  getOrchestratorStats: (...args: unknown[]) => mocks.getOrchestratorStats(...args),
}))

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/orchestrator/chat', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
}

const session = { userId: 'user-1', email: 'owner@example.com', name: 'Owner', role: 'owner', workspaceId: 'ws-1' }
const member = { role: 'owner' }
const result = {
  response: 'Respuesta comercial',
  mode: 'valiautoflow',
  intent: 'commercial',
  confidence: 0.92,
  valiautoflowAgent: 'prefilter',
  valiautoflowStage: 'qualification',
  model: 'secret-model-name',
  tokensUsed: 123,
  latencyMs: 456,
  reasoning: 'internal reasoning must not leave the server',
  events: [{ type: 'internal', timestamp: new Date(), data: { secret: true } }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue(session)
  mocks.requireWorkspace.mockResolvedValue(member)
  mocks.requirePermission.mockReturnValue(undefined)
  mocks.rateLimit.mockReturnValue({ success: true, retryAfter: null })
  mocks.contactFindFirst.mockResolvedValue({ id: 'contact-1' })
  mocks.processMessage.mockResolvedValue(result)
  mocks.getOrchestratorStats.mockReturnValue({ calls: 1 })
})

describe('POST /api/orchestrator/chat', () => {
  it('requires the workspace permission and returns only public orchestration fields', async () => {
    const route = await import('./route')
    const response = await route.POST(makeRequest({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      message: 'Quiero una demo',
      conversationHistory: [{ role: 'user', content: 'Hola' }],
      forceMode: 'valiautoflow',
      tags: ['hot'],
      leadScore: 80,
    }) as never)

    expect(response.status).toBe(200)
    expect(mocks.requirePermission).toHaveBeenCalledWith('owner', 'agents.manage')
    expect(mocks.contactFindFirst).toHaveBeenCalledWith({
      where: { id: 'contact-1', workspaceId: 'ws-1' },
      select: { id: true },
    })
    expect(mocks.processMessage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      message: 'Quiero una demo',
    }))

    const body = await response.json()
    expect(body).toEqual({
      response: 'Respuesta comercial',
      mode: 'valiautoflow',
      intent: 'commercial',
      confidence: 0.92,
      valiautoflowAgent: 'prefilter',
      valiautoflowStage: 'qualification',
    })
    expect(body.reasoning).toBeUndefined()
    expect(body.events).toBeUndefined()
    expect(body.model).toBeUndefined()
    expect(body.tokensUsed).toBeUndefined()
  })

  it('does not process a contact from another workspace', async () => {
    mocks.contactFindFirst.mockResolvedValue(null)
    const route = await import('./route')
    const response = await route.POST(makeRequest({
      workspaceId: 'ws-1', contactId: 'contact-from-other-tenant', message: 'Hola',
    }) as never)

    expect(response.status).toBe(404)
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })

  it('rejects oversized or malformed conversation history before invoking the model', async () => {
    const route = await import('./route')
    const response = await route.POST(makeRequest({
      workspaceId: 'ws-1',
      message: 'Hola',
      conversationHistory: [{ role: 'user', content: 'x'.repeat(2_001) }],
    }) as never)

    expect(response.status).toBe(400)
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })

  it('returns 429 when the request is rate limited', async () => {
    mocks.rateLimit.mockReturnValue({ success: false, retryAfter: 30 })
    const route = await import('./route')
    const response = await route.POST(makeRequest({ workspaceId: 'ws-1', message: 'Hola' }) as never)

    expect(response.status).toBe(429)
    expect(mocks.processMessage).not.toHaveBeenCalled()
  })
})

describe('GET /api/orchestrator/chat', () => {
  it('protects internal stats with authentication, workspace membership and RBAC', async () => {
    const route = await import('./route')
    const response = await route.GET(makeRequest(undefined, 'GET') as never)

    expect(response.status).toBe(200)
    expect(mocks.requireWorkspace).toHaveBeenCalledWith('ws-1', 'user-1')
    expect(mocks.requirePermission).toHaveBeenCalledWith('owner', 'agents.manage')
    expect(await response.json()).toEqual({ stats: { calls: 1 } })
  })
})
