// ═══════════════════════════════════════════════════════════════
// TEST: processMessageCore — operatorInitiated flag
//
// Pins the bug-fix contract: when the caller is /api/ai/chat and the
// text was typed by a human operator in the Inbox (operatorInitiated
// = true), the processor MUST NOT save the operator's text a second
// time as an inbound message from the contact. The correct
// persistence path is /api/whatsapp/send → outbound/human.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────

// Mock all heavy dependencies so the test focuses on the save logic
// without touching LLM calls, MySQL, or analytics side-effects.

const mockDb = {
  workspace: { findUnique: vi.fn() },
  contact: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  conversation: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  message: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  agent: { findFirst: vi.fn() },
  agentPersona: { findFirst: vi.fn() },
  agentLog: { create: vi.fn(), count: vi.fn() },
  analyticsEvent: { create: vi.fn() },
  leadActivity: { upsert: vi.fn() },
  followUpTask: { updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  appointment: { findFirst: vi.fn(), create: vi.fn() },
  leadProfile: { updateMany: vi.fn() },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

// Stub the revenue engine so we never make LLM calls
vi.mock('@/lib/ai', () => ({
  RevenueEngine: class {
    async processConversation() {
      return {
        action: 'engage',
        strategy: 'stub',
        response: null,
        followUpTasks: [],
        crmUpdates: [],
        agentRouting: { agentType: 'qualifier', confidence: 0.5, reasoning: 'stub' },
        aiMetrics: null,
      }
    }
    async analyzeSentiment() { return 'NEUTRAL' }
    async classifyIntent() { return 'info' }
  },
  computeLeadScoreDelta: () => 5,
  buildIntentActionDirective: () => 'INTENCIÓN DETECTADA: INFO',
}))

vi.mock('@/lib/ai/conversation-middleware', () => ({
  preProcess: () => ({ state: { phone: 'p' }, contextBlock: '' }),
  postProcess: (s: string) => ({ filteredResponse: s, wasModified: false }),
  injectContext: (msgs: any[]) => msgs,
}))

vi.mock('@/lib/crm/auto-deal', () => ({
  autoCreateOrUpdateDeal: vi.fn(),
}))

vi.mock('@/lib/crm/contact-info-extractor', () => ({
  extractContactInfoFromText: () => ({}),
  buildContactInfoUpdate: () => ({ data: {}, changedFields: [] }),
}))

vi.mock('@/lib/ai/lead-profiler', () => ({
  leadProfiler: { profileContact: vi.fn(), buildProfileContext: vi.fn() },
}))

vi.mock('@/lib/email', () => ({
  sendAppointmentConfirmationEmail: vi.fn(),
}))

vi.mock('@/lib/ai/prompt-composer', () => ({
  loadWorkspaceModules: vi.fn().mockResolvedValue([]),
  composePrompt: vi.fn().mockReturnValue({ agentName: 'Jhon', activeTools: [] }),
  buildModuleContext: vi.fn().mockReturnValue(''),
  loadHooksBlock: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/lib/ai/crm-tool-parser', () => ({
  parseCRMActions: () => [],
  stripCRMActions: (s: string) => s,
  buildCRMToolsInstruction: () => '',
}))

vi.mock('@/lib/ai/agent-router', () => ({
  AgentRouter: class {
    routeMessage() {
      return {
        agentType: 'qualifier',
        confidence: 0.5,
        reasoning: 'stub',
        intent: 'general',
      }
    }
  },
  getAgentForContact: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/event-bus', () => ({
  publish: vi.fn().mockResolvedValue('evt_test'),
  eventBus: {
    emit: vi.fn().mockResolvedValue('evt_test'),
    on: vi.fn().mockReturnValue(() => {}),
  },
}))

vi.mock('@/lib/telegram', () => ({
  broadcastToWorkspace: vi.fn(),
}))

// Silence logs for clean test output
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})

// ─── Helpers ──────────────────────────────────────────────────

const WORKSPACE = { id: 'ws-1', name: 'Test', plan: 'free', settings: '{}' }
const CONTACT = {
  id: 'contact-1',
  workspaceId: 'ws-1',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '5215551234567',
  source: 'whatsapp',
  tags: '[]',
  customFields: '{}',
  leadScore: 10,
  temperature: 'cold',
  createdAt: new Date(),
}
const CONVERSATION = {
  id: 'conv-1',
  workspaceId: 'ws-1',
  contactId: 'contact-1',
  channel: 'whatsapp',
  status: 'active',
  metadata: '{}',
  lastMessageAt: new Date(),
  createdAt: new Date(),
}

beforeEach(() => {
  Object.values(mockDb).forEach((m: any) => {
    Object.values(m).forEach((fn: any) => fn?.mockReset?.())
  })

  // Defaults
  mockDb.workspace.findUnique.mockResolvedValue(WORKSPACE)
  mockDb.contact.findUnique.mockResolvedValue(CONTACT)
  mockDb.contact.upsert.mockResolvedValue(CONTACT)
  mockDb.contact.findFirst.mockResolvedValue(CONTACT)
  mockDb.contact.update.mockResolvedValue(CONTACT)
  mockDb.conversation.findUnique.mockResolvedValue(CONVERSATION)
  mockDb.conversation.findFirst.mockResolvedValue(CONVERSATION)
  mockDb.conversation.create.mockResolvedValue(CONVERSATION)
  mockDb.conversation.update.mockResolvedValue(CONVERSATION)
  mockDb.message.create.mockResolvedValue({ id: 'msg-new' })
  mockDb.message.findMany.mockResolvedValue([])
  mockDb.message.count.mockResolvedValue(0)
  mockDb.agent.findFirst.mockResolvedValue(null)
  mockDb.agentPersona.findFirst.mockResolvedValue(null)
  mockDb.agentLog.create.mockResolvedValue({})
  mockDb.agentLog.count.mockResolvedValue(0)
  mockDb.analyticsEvent.create.mockResolvedValue({})
  mockDb.leadActivity.upsert.mockResolvedValue({})
})

// ─── Tests ────────────────────────────────────────────────────

describe('processMessageCore — operatorInitiated flag', () => {
  it('saves the text as INBOUND/contact when operatorInitiated is omitted (default = customer message)', async () => {
    const { processMessageCore } = await import('@/lib/ai/message-processor')

    await processMessageCore({
      text: 'Hola, quiero info',
      phone: '5215551234567',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      skipAI: true,
    })

    expect(mockDb.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          content: 'Hola, quiero info',
          direction: 'inbound',
          senderType: 'contact',
        }),
      }),
    )
  })

  it('saves the text as INBOUND/contact when operatorInitiated = false (explicit)', async () => {
    const { processMessageCore } = await import('@/lib/ai/message-processor')

    await processMessageCore({
      text: 'Hola, quiero info',
      phone: '5215551234567',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      operatorInitiated: false,
      skipAI: true,
    })

    expect(mockDb.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'inbound',
          senderType: 'contact',
        }),
      }),
    )
  })

  it('DOES NOT save the text as inbound/contact when operatorInitiated = true (the bug-fix contract)', async () => {
    const { processMessageCore } = await import('@/lib/ai/message-processor')

    const result = await processMessageCore({
      text: 'Hola, te confirmo la cita mañana',
      phone: '5215551234567',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      operatorInitiated: true,
      skipAI: true,
    })

    expect(result.success).toBe(true)
    expect(result.conversationId).toBe('conv-1')
    expect(result.contactId).toBe('contact-1')

    // The processor must NOT have called db.message.create with
    // direction='inbound' / senderType='contact' for the operator
    // text. The caller (api/ai/chat) is responsible for that, and
    // the operator's text was already persisted as outbound/human
    // by /api/whatsapp/send.
    const inboundSaves = mockDb.message.create.mock.calls.filter(
      ([args]: any) =>
        args?.data?.direction === 'inbound' && args?.data?.senderType === 'contact',
    )
    expect(inboundSaves).toHaveLength(0)
  })

  it('behaves identically to skipMessageSave=true (backward-compat alias)', async () => {
    const { processMessageCore } = await import('@/lib/ai/message-processor')

    await processMessageCore({
      text: 'webhook-saved-this',
      phone: '5215551234567',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      skipMessageSave: true, // legacy path used by the Baileys webhook
      skipAI: true,
    })

    const inboundSaves = mockDb.message.create.mock.calls.filter(
      ([args]: any) =>
        args?.data?.direction === 'inbound' && args?.data?.senderType === 'contact',
    )
    expect(inboundSaves).toHaveLength(0)
  })

  it('does NOT touch contact info extraction when operatorInitiated = true', async () => {
    // We expect that the contact's email/name fields are not rewritten
    // based on operator-typed text. The "extract contact info" path is
    // for messages from the customer.
    const { processMessageCore } = await import('@/lib/ai/message-processor')

    await processMessageCore({
      text: 'Mi correo es otro@example.com',
      phone: '5215551234567',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      contactId: 'contact-1',
      operatorInitiated: true,
      skipAI: true,
    })

    // No inbound save AND no contact update based on the operator text
    const inboundSaves = mockDb.message.create.mock.calls.filter(
      ([args]: any) =>
        args?.data?.direction === 'inbound' && args?.data?.senderType === 'contact',
    )
    expect(inboundSaves).toHaveLength(0)
    // contact.update should not have been called by the contact-info path
    const contactInfoUpdates = mockDb.contact.update.mock.calls
    expect(contactInfoUpdates).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// TEST: extractFinalResponse — strips chain-of-thought leaks
// ═══════════════════════════════════════════════════════════════
describe('extractFinalResponse', () => {
  it('removes English reasoning leaks wrapped in *asterisks*', async () => {
    const { extractFinalResponse } = await import('@/lib/ai/message-processor')
    const out = extractFinalResponse(
      '¡Excelente! Para emitir tu factura necesito tu RFC. *Wait, is asking for RFC too much for a "demo call" request?* ¿Me lo compartes?'
    )
    expect(out).not.toMatch(/wait,? is asking/i)
    expect(out).toContain('Para emitir tu factura')
    expect(out).toContain('¿Me lo compartes?')
  })

  it('preserves legitimate WhatsApp *bold* (prices, emphasis)', async () => {
    const { extractFinalResponse } = await import('@/lib/ai/message-processor')
    const out = extractFinalResponse('El plan cuesta *$2,400/mes* e incluye soporte.')
    expect(out).toContain('*$2,400/mes*')
  })

  it('drops a standalone English reasoning line', async () => {
    const { extractFinalResponse } = await import('@/lib/ai/message-processor')
    const out = extractFinalResponse('Hmm, the user wants pricing.\n¡Claro! Te paso los planes ahora mismo.')
    expect(out).not.toMatch(/the user wants pricing/i)
    expect(out).toContain('Te paso los planes')
  })
})
