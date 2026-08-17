import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  conversationCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  messageCreate: vi.fn(),
  contactFindUnique: vi.fn(),
  contactUpdate: vi.fn(),
  routedSendText: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    conversation: {
      findFirst: mocks.conversationFindFirst,
      create: mocks.conversationCreate,
      update: mocks.conversationUpdate,
    },
    message: { create: mocks.messageCreate },
    contact: {
      findUnique: mocks.contactFindUnique,
      update: mocks.contactUpdate,
    },
  },
}))

vi.mock('@/lib/whatsapp/channel-router', () => ({
  routedSendText: mocks.routedSendText,
}))

import { executeAutomationActions } from '@/lib/automations/executor'

const contact = {
  id: 'contact-1',
  firstName: 'Ana',
  lastName: 'López',
  phone: 'masked-phone',
}

const baseInput = {
  automationId: 'automation-1',
  workspaceId: 'workspace-1',
  contact,
}

describe('executeAutomationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.routedSendText.mockResolvedValue({ success: true, messageId: 'provider-message-1' })
    mocks.conversationFindFirst.mockResolvedValue({ id: 'conversation-1' })
    mocks.conversationCreate.mockResolvedValue({ id: 'conversation-created-1' })
    mocks.conversationUpdate.mockResolvedValue({})
    mocks.messageCreate.mockResolvedValue({ id: 'message-1' })
    mocks.contactFindUnique.mockResolvedValue({ tags: '[]' })
    mocks.contactUpdate.mockResolvedValue({})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  })

  it('sends a message through the routed channel and persists it after success', async () => {
    const result = await executeAutomationActions({
      ...baseInput,
      actions: [{ type: 'send_message', payload: { message: 'Hola [NOMBRE]' } }],
    })

    expect(result.errors).toEqual([])
    expect(result.executedActions).toEqual(['send_message: "Hola Ana"'])
    expect(mocks.routedSendText).toHaveBeenCalledWith('workspace-1', 'masked-phone', 'Hola Ana')
    expect(mocks.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        conversationId: 'conversation-1',
        content: 'Hola Ana',
        externalId: 'provider-message-1',
      }),
    }))
  })

  it('updates supported contact fields', async () => {
    const result = await executeAutomationActions({
      ...baseInput,
      actions: [{ type: 'update_contact', payload: { leadScore: 80, stage: 'qualified', ignored: true } }],
    })

    expect(result.errors).toEqual([])
    expect(result.executedActions).toEqual(['update_contact: leadScore, stage'])
    expect(mocks.contactUpdate).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { leadScore: 80, stage: 'qualified' },
    })
  })

  it('adds a tag idempotently', async () => {
    mocks.contactFindUnique.mockResolvedValue({ tags: JSON.stringify(['existing']) })

    const result = await executeAutomationActions({
      ...baseInput,
      actions: [{ type: 'add_tag', payload: { tag: 'hot-lead' } }],
    })

    expect(result.errors).toEqual([])
    expect(result.executedActions).toEqual(['add_tag: "hot-lead"'])
    expect(mocks.contactUpdate).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { tags: JSON.stringify(['existing', 'hot-lead']) },
    })
  })

  it('posts a webhook and reports a provider failure as an error', async () => {
    const result = await executeAutomationActions({
      ...baseInput,
      actions: [{ type: 'webhook', payload: { url: 'https://example.test/automation' } }],
      context: { source: 'test' },
    })

    expect(result.errors).toEqual([])
    expect(result.executedActions).toEqual(['webhook: https://example.test/automation'])
    expect(fetch).toHaveBeenCalledWith('https://example.test/automation', expect.objectContaining({ method: 'POST' }))

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))
    const failed = await executeAutomationActions({
      ...baseInput,
      actions: [{ type: 'webhook', payload: { url: 'https://example.test/automation' } }],
    })
    expect(failed.executedActions).toEqual([])
    expect(failed.errors).toEqual(['webhook: webhook returned HTTP 500'])
  })
})
