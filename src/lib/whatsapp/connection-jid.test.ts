// ═══════════════════════════════════════════════════════════════
// TEST: WhatsAppManager.sendMessage — JID contract
//
// Pins the Baileys-side JID format: every outbound message sent
// from a workspace's per-workspace Baileys manager must use the
// JID format `${phone}@s.whatsapp.net`. This is the single most
// common place a Baileys send silently fails (wrong JID → server
// drops the message and the customer never receives it).
//
// Why this test exists separately from channel-router.test.ts:
//
//   The channel-router delegates to `manager.sendMessage(phone,
//   text)`. The JID construction lives INSIDE WhatsAppManager.
//   Testing the router alone would only prove the router forwards
//   the right phone — it would not catch a refactor of the manager
//   that changes the JID format (e.g. dropping the suffix, or
//   switching to `.us`).
//
//   This test instantiates a WhatsAppManager, injects a mock sock,
//   and asserts on the JID argument that reaches the Baileys
//   sendMessage call.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to suppress the module-level bootstrap that
// connection.ts triggers via `whatsAppRegistry.bootstrapFromDb()`
// in the registry init. The bootstrap touches the real DB, which
// we must avoid. We do that by stubbing db BEFORE the import.
const mockDb = {
  whatsAppAuth: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  workspace: { findMany: vi.fn().mockResolvedValue([]) },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

// ─── Mocks for the manager's heavy deps ───────────────────────
vi.mock('@/lib/ai', () => ({
  RevenueEngine: class {},
  // (humanizer is imported via @/lib/ai/humanizer — see below)
}))

vi.mock('@/lib/ai/humanizer', () => ({
  humanizeResponse: vi.fn((s: string) => s),
  getRandomDelay: vi.fn(() => 0),
}))

vi.mock('@/lib/ai/conversation-middleware', () => ({
  enqueueMessage: vi.fn(),
  preProcess: vi.fn(),
  postProcess: vi.fn((s: string) => ({ filteredResponse: s, wasModified: false })),
  injectContext: vi.fn((m: unknown) => m),
}))

vi.mock('@/lib/ai/message-processor', () => ({
  processMessageCore: vi.fn(),
}))

vi.mock('@/lib/whatsapp/db-auth-state', () => ({
  DbAuthState: class {
    constructor(public workspaceId: string) {}
  },
}))

vi.mock('@/lib/whatsapp/media-handler', () => ({
  detectMedia: vi.fn(),
  downloadAndSaveMedia: vi.fn(),
}))

vi.mock('@/lib/whatsapp/shared-dedup', () => ({
  isDuplicateMessage: vi.fn(() => false),
}))

import { WhatsAppManager } from '@/lib/whatsapp/connection'

beforeEach(() => {
  mockDb.whatsAppAuth.findMany.mockClear()
  mockDb.workspace.findMany.mockClear()
})

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Build a manager with an injected sock + connected flag.
 * Bypasses the `private` modifier via a type assertion — this is
 * the standard pattern in unit tests where the production class
 * has encapsulated state we need to drive.
 */
function makeConnectedManager(workspaceId: string, sock: any) {
  const mgr = new WhatsAppManager(workspaceId) as any
  mgr.sock = sock
  mgr._connected = true
  return mgr as WhatsAppManager
}

// ─── Tests ────────────────────────────────────────────────────

describe('WhatsAppManager.sendMessage — JID contract', () => {
  it('builds the JID as `${phone}@s.whatsapp.net` for a normal phone number', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'wamid-1' } })
    const mgr = makeConnectedManager('ws-jid-1', { sendMessage })

    const result = await mgr.sendMessage('5215551234567', 'Hola')

    expect(result.success).toBe(true)
    expect(sendMessage).toHaveBeenCalledWith('5215551234567@s.whatsapp.net', { text: 'Hola' })
  })

  it('preserves the country code (does not strip or normalize the phone)', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'wamid-2' } })
    const mgr = makeConnectedManager('ws-jid-2', { sendMessage })

    await mgr.sendMessage('5491133334444', 'Hi')

    // The JID must contain the full E.164 digits; no trimming.
    expect(sendMessage.mock.calls[0][0]).toBe('5491133334444@s.whatsapp.net')
  })

  it('returns success=true with the message id from Baileys', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ key: { id: 'wamid-xyz-99' } })
    const mgr = makeConnectedManager('ws-jid-3', { sendMessage })

    const result = await mgr.sendMessage('5215551234567', 'x')

    expect(result).toEqual({ success: true, id: 'wamid-xyz-99' })
  })

  it('returns success=false with the error message when the manager is not connected (sock=null)', async () => {
    // The "sock null" path is the one the operator-send flow must
    // catch to produce a 503. This is the manager-level half of
    // the contract.
    const sendMessage = vi.fn()
    const mgr = new WhatsAppManager('ws-jid-4') as any
    mgr.sock = null
    mgr._connected = false
    // Intentionally do NOT install a sock — confirms the short-circuit.

    const result = await mgr.sendMessage('5215551234567', 'x')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not connected/i)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('returns success=false when Baileys sendMessage throws (does not propagate the throw)', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('Boom'))
    const mgr = makeConnectedManager('ws-jid-5', { sendMessage })

    const result = await mgr.sendMessage('5215551234567', 'x')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Boom/)
  })
})
