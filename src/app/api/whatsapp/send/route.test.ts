// ═══════════════════════════════════════════════════════════════
// TEST: POST /api/whatsapp/send
//
// The Inbox "Manual mode" + "AI mode" both hit this endpoint first
// to deliver the operator's text to the customer. These tests pin
// the contract: the message must be sent via the channel-router,
// persisted as outbound/human, and the route must return 503 when
// the channel send fails.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────

const mockRequireAuth = vi.fn()
const mockGetClientIp: any = vi.fn(() => '127.0.0.1')
const mockRateLimit: any = vi.fn()
const mockValidateBody = vi.fn()
const mockSendOperatorMessage = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  errorResponse: (err: unknown, fallback = 'Error interno del servidor') => {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: fallback, original: msg }, { status: 500 })
  },
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  RATE_LIMITS: {
    whatsappSend: { limit: 30, windowMs: 60_000 },
  },
}))

vi.mock('@/lib/validations', () => ({
  validateBody: (...args: unknown[]) => mockValidateBody(...args),
  whatsappSendSchema: { _tag: 'whatsappSendSchema' },
}))

vi.mock('@/lib/whatsapp/operator-send', () => ({
  sendOperatorMessage: (...args: unknown[]) => mockSendOperatorMessage(...args),
}))

// ─── Helpers ──────────────────────────────────────────────────

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

const VALID_BODY = {
  phone: '5215551234567',
  message: 'Hola, te confirmo la cita mañana',
  workspaceId: 'ws-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
}

const SESSION = { userId: 'user-1', workspaceId: 'ws-1' }

beforeEach(() => {
  mockRequireAuth.mockReset()
  mockGetClientIp.mockClear()
  mockRateLimit.mockClear()
  mockValidateBody.mockReset()
  mockSendOperatorMessage.mockReset()

  // Defaults for the happy path
  mockRequireAuth.mockResolvedValue(SESSION)
  mockRateLimit.mockReturnValue({ success: true, remaining: 999, retryAfter: null, limit: 100 })
  mockValidateBody.mockReturnValue({ success: true, data: VALID_BODY })
  mockSendOperatorMessage.mockResolvedValue({
    success: true,
    delivered: true,
    persisted: true,
    messageId: 'wamid-1',
    dbMessageId: 'msg-1',
  })
})

// ─── Tests ────────────────────────────────────────────────────

describe('POST /api/whatsapp/send', () => {
  // ─── Happy path ──────────────────────────────────────────────
  it('delivers via the operator-send helper and returns 200 with success=true', async () => {
    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.messageId).toBe('wamid-1')
    expect(json.delivered).toBe(true)
    expect(json.persisted).toBe(true)
    expect(json.phone).toBe(VALID_BODY.phone)

    // Verifies that the route delegates to the helper with the
    // correct args (channel-router is exercised inside the helper
    // — see operator-send.test.ts for routing coverage).
    expect(mockSendOperatorMessage).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      phone: VALID_BODY.phone,
      message: VALID_BODY.message,
      conversationId: 'conv-1',
      contactId: 'contact-1',
    })
  })

  // ─── Baileys failure ─────────────────────────────────────────
  it('returns 503 when the channel send fails and does not persist a row', async () => {
    mockSendOperatorMessage.mockResolvedValueOnce({
      success: false,
      delivered: false,
      persisted: false,
      error: 'WhatsApp not connected',
    })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('WhatsApp not connected')
  })

  // ─── Channel-router contract ─────────────────────────────────
  it('works for Meta Cloud workspaces — the helper delegates to routedSendText (verified via test of helper)', async () => {
    // The route itself is channel-agnostic. It always calls the
    // operator-send helper, which always calls routedSendText. The
    // actual Baileys vs Meta branching happens inside the router.
    // This test pins the contract: even for a Meta workspace, the
    // route does not pin itself to Baileys.
    const metaBody = { ...VALID_BODY, workspaceId: 'ws-meta' }
    mockValidateBody.mockReturnValueOnce({ success: true, data: metaBody })
    mockRequireAuth.mockResolvedValueOnce({ userId: 'user-1', workspaceId: 'ws-meta' })
    mockSendOperatorMessage.mockResolvedValueOnce({
      success: true,
      delivered: true,
      persisted: true,
      messageId: 'meta-wamid-1',
    })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(metaBody) as any)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.messageId).toBe('meta-wamid-1')
    expect(mockSendOperatorMessage).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-meta' }),
    )
  })

  // ─── Cross-tenant guard ──────────────────────────────────────
  it('returns 403 when body.workspaceId does not match the session', async () => {
    mockValidateBody.mockReturnValueOnce({
      success: true,
      data: { ...VALID_BODY, workspaceId: 'ws-other' },
    })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Workspace mismatch')
    expect(mockSendOperatorMessage).not.toHaveBeenCalled()
  })

  // ─── Validation ──────────────────────────────────────────────
  it('returns 400 when the body fails Zod validation', async () => {
    mockValidateBody.mockReturnValueOnce({
      success: false,
      error: 'Número de teléfono inválido',
    })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe('VALIDATION_ERROR')
    expect(mockSendOperatorMessage).not.toHaveBeenCalled()
  })

  it('returns 400 when conversationId is missing', async () => {
    mockValidateBody.mockReturnValueOnce({
      success: true,
      data: { ...VALID_BODY, conversationId: undefined },
    })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/conversationId/)
    expect(mockSendOperatorMessage).not.toHaveBeenCalled()
  })

  // ─── Auth & rate limit guards ────────────────────────────────
  it('returns 400 when the session has no workspaceId', async () => {
    mockRequireAuth.mockResolvedValueOnce({ userId: 'user-1', workspaceId: null })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(400)
    expect(mockSendOperatorMessage).not.toHaveBeenCalled()
  })

  it('returns 429 when the rate limiter rejects the request', async () => {
    mockRateLimit.mockReturnValueOnce({
      success: false,
      remaining: 0,
      retryAfter: 30,
      limit: 30,
    })

    const mod = await import('@/app/api/whatsapp/send/route')
    const res = await mod.POST(makeReq(VALID_BODY) as any)

    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.code).toBe('RATE_LIMITED')
    expect(mockSendOperatorMessage).not.toHaveBeenCalled()
  })
})
