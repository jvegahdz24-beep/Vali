// ═══════════════════════════════════════════════════════════════
// Tests — Message Processor (Core Pipeline)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ALL dependencies before import
const mockUpsert = vi.fn()
const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    workspace: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      findFirst: (...args: any[]) => mockFindFirst(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    phoneWorkspaceMapping: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
    contact: {
      upsert: (...args: any[]) => mockUpsert(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      findFirst: (...args: any[]) => mockFindFirst(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    conversation: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      create: (...args: any[]) => mockCreate(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    message: {
      create: (...args: any[]) => mockCreate(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
    },
    agent: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      findMany: (...args: any[]) => mockFindMany(...args),
    },
    agentLog: {
      create: (...args: any[]) => mockCreate(...args),
    },
    analyticsEvent: {
      create: (...args: any[]) => mockCreate(...args),
    },
  },
}))

vi.mock('@/lib/ai', () => {
  const mockProcessConversation = vi.fn().mockResolvedValue({
    response: {
      rawResponse: 'Hola, ¿en qué te puedo ayudar?',
      insight: 'Lead interesado',
      question: '¿Qué buscas?',
    },
    action: 'educate',
    agentRouting: { agentType: 'sales', confidence: 0.8 },
    crmUpdates: [{ type: 'tags', value: ['interesado'] }],
  })
  return {
    RevenueEngine: class {
      processConversation = mockProcessConversation
    },
  }
})

vi.mock('@/lib/ai/conversation-middleware', () => ({
  preProcess: vi.fn().mockReturnValue({ state: {}, contextBlock: '' }),
  postProcess: vi.fn().mockReturnValue({ filteredResponse: 'Respuesta filtrada', wasModified: false }),
  injectContext: vi.fn().mockImplementation((msgs, ctx) => msgs),
}))

vi.mock('@/lib/ai/conversation-state', () => ({
  ensureStateLoaded: vi.fn().mockResolvedValue(undefined),
  persistState: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/crm/auto-deal', () => ({
  autoCreateOrUpdateDeal: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ai/lead-profiler', () => ({
  leadProfiler: {
    profileContact: vi.fn().mockResolvedValue(null),
    buildProfileContext: vi.fn().mockReturnValue(''),
  },
}))

vi.mock('@/lib/utils', () => ({
  normalizePhone: vi.fn().mockImplementation((p: string) => p.replace(/\D/g, '').replace(/^52/, '')),
}))

vi.mock('@/lib/logger', () => ({
  debug: vi.fn(),
}))

describe('processMessageCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lanza error si no hay workspace', async () => {
    // phoneWorkspaceMapping returns null (no mapping)
    mockFindFirst.mockResolvedValueOnce(null)
    // workspace findFirst returns null (no workspace)
    mockFindFirst.mockResolvedValueOnce(null)

    const { processMessageCore } = await import('@/lib/ai/message-processor')

    await expect(
      processMessageCore({
        text: 'Hola',
        phone: '5512345678',
      })
    ).rejects.toThrow('No workspace found')
  })

  it('procesa mensaje exitosamente con workspace existente', async () => {
    // phoneWorkspaceMapping returns null (no mapping → falls back)
    mockFindFirst.mockResolvedValueOnce(null)
    // Workspace exists
    mockFindFirst.mockResolvedValueOnce({
      id: 'ws_1',
      name: 'Test Workspace',
      industry: 'services',
      settings: '{}',
      isActive: true,
    })

    // Contact upsert
    mockUpsert.mockResolvedValue({
      id: 'contact_1',
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '5512345678',
      source: 'whatsapp',
      tags: '[]',
      leadScore: 0,
      workspaceId: 'ws_1',
    })

    // Find conversation - exists
    mockFindFirst.mockResolvedValueOnce({
      id: 'conv_1',
      workspaceId: 'ws_1',
      contactId: 'contact_1',
      channel: 'whatsapp',
      status: 'active',
    })

    // Save inbound message
    mockCreate.mockResolvedValue({ id: 'msg_1' })

    // Update conversation
    mockUpdate.mockResolvedValue({})

    // Load history
    mockFindMany.mockResolvedValue([
      { content: 'Hola', senderType: 'contact' },
    ])

    // Find agent
    mockFindFirst.mockResolvedValueOnce({ id: 'agent_1' })

    const { processMessageCore } = await import('@/lib/ai/message-processor')

    const result = await processMessageCore({
      text: 'Hola, ¿cómo están?',
      phone: '5512345678',
      pushName: 'Juan',
    })

    expect(result.success).toBe(true)
    expect(result.contactId).toBe('contact_1')
    expect(result.aiReplyText).toBeTruthy()
  })

  it('crea conversación nueva si no existe', async () => {
    // phoneWorkspaceMapping returns null
    mockFindFirst.mockResolvedValueOnce(null)
    // Workspace
    mockFindFirst.mockResolvedValueOnce({
      id: 'ws_1',
      name: 'WS',
      industry: 'services',
      settings: '{}',
      isActive: true,
    })

    // Contact
    mockUpsert.mockResolvedValue({
      id: 'c1',
      firstName: 'Ana',
      lastName: null,
      phone: '5598765432',
      source: 'whatsapp',
      tags: '[]',
      leadScore: 0,
      workspaceId: 'ws_1',
    })

    // No conversation found
    mockFindFirst.mockResolvedValueOnce(null)

    // Create conversation
    mockCreate.mockResolvedValueOnce({
      id: 'conv_new',
      workspaceId: 'ws_1',
      contactId: 'c1',
      channel: 'whatsapp',
    })

    // Save message, update conv, etc.
    mockCreate.mockResolvedValue({})
    mockUpdate.mockResolvedValue({})
    mockFindMany.mockResolvedValue([])
    mockFindFirst.mockResolvedValue({ id: 'a1' })

    const { processMessageCore } = await import('@/lib/ai/message-processor')

    const result = await processMessageCore({
      text: 'Nuevo mensaje',
      phone: '5598765432',
    })

    expect(result.conversationId).toBe('conv_new')
    expect(result.success).toBe(true)
  })

  it('skipAI retorna sin respuesta de IA', async () => {
    // phoneWorkspaceMapping returns null
    mockFindFirst.mockResolvedValueOnce(null)
    mockFindFirst.mockResolvedValueOnce({
      id: 'ws_1',
      name: 'WS',
      industry: 'services',
      settings: '{}',
      isActive: true,
    })

    mockUpsert.mockResolvedValue({
      id: 'c1',
      firstName: 'User',
      lastName: null,
      phone: '5511111111',
      source: 'whatsapp',
      tags: '[]',
      leadScore: 0,
      workspaceId: 'ws_1',
    })

    mockFindFirst.mockResolvedValue({
      id: 'conv_1',
      workspaceId: 'ws_1',
      contactId: 'c1',
      channel: 'whatsapp',
      status: 'active',
    })

    const { processMessageCore } = await import('@/lib/ai/message-processor')

    const result = await processMessageCore({
      text: '📷',
      phone: '5511111111',
      skipAI: true,
    })

    expect(result.success).toBe(true)
    expect(result.aiReplyText).toBeNull()
  })

  it('usa workspaceId forzado si se proporciona', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'ws_forced',
      name: 'Forced WS',
      industry: 'tech',
      settings: '{}',
      isActive: true,
    })

    mockUpsert.mockResolvedValue({
      id: 'c1',
      firstName: 'Pedro',
      lastName: null,
      phone: '5533333333',
      source: 'whatsapp',
      tags: '[]',
      leadScore: 0,
      workspaceId: 'ws_forced',
    })

    mockFindFirst.mockResolvedValue({
      id: 'conv_1',
      workspaceId: 'ws_forced',
      contactId: 'c1',
      channel: 'whatsapp',
      status: 'active',
    })

    mockCreate.mockResolvedValue({})
    mockUpdate.mockResolvedValue({})
    mockFindMany.mockResolvedValue([])
    mockFindFirst.mockResolvedValue({ id: 'a1' })

    const { processMessageCore } = await import('@/lib/ai/message-processor')

    const result = await processMessageCore({
      text: 'Test',
      phone: '5533333333',
      workspaceId: 'ws_forced',
    })

    expect(result.success).toBe(true)
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ws_forced' } })
    )
  })
})
