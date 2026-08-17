// ═══════════════════════════════════════════════════════════════
// TEST: sendOperatorMessage helper
//
// Verifies the routing + persistence contract for "human operator
// sends a WhatsApp message to the customer" — the single source of
// truth used by /api/whatsapp/send and (in the future) any other
// server-side caller that needs to deliver an operator-authored
// message.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────

const mockRoutedSendText = vi.fn()

vi.mock('@/lib/whatsapp/channel-router', () => ({
  routedSendText: (...args: unknown[]) => mockRoutedSendText(...args),
}))

const mockMessageCreate = vi.fn()
const mockConversationUpdate = vi.fn()
const mockContactUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    message: { create: (...args: unknown[]) => mockMessageCreate(...args) },
    conversation: { update: (...args: unknown[]) => mockConversationUpdate(...args) },
    contact: { update: (...args: unknown[]) => mockContactUpdate(...args) },
  },
}))

// Silence expected console.error in the DB-failure case
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

// ─── Tests ────────────────────────────────────────────────────

describe('sendOperatorMessage', () => {
  beforeEach(() => {
    mockRoutedSendText.mockReset()
    mockMessageCreate.mockReset()
    mockConversationUpdate.mockReset()
    mockContactUpdate.mockReset()
    consoleErrorSpy.mockClear()
  })

  it('delivers via routedSendText and persists as outbound/human (Baileys success path)', async () => {
    mockRoutedSendText.mockResolvedValueOnce({ success: true, messageId: 'wamid-123' })
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg-1' })
    mockConversationUpdate.mockResolvedValueOnce({})
    mockContactUpdate.mockResolvedValueOnce({})

    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')

    const result = await sendOperatorMessage({
      workspaceId: 'ws-1',
      phone: '5215551234567',
      message: 'Hola, gracias por tu interés',
      conversationId: 'conv-1',
      contactId: 'contact-1',
    })

    expect(result.success).toBe(true)
    expect(result.delivered).toBe(true)
    expect(result.persisted).toBe(true)
    expect(result.messageId).toBe('wamid-123')
    expect(result.dbMessageId).toBe('msg-1')

    // Routed through the channel-router (NOT pinned to Baileys)
    expect(mockRoutedSendText).toHaveBeenCalledWith('ws-1', '5215551234567', 'Hola, gracias por tu interés')

    // Persisted with the correct direction/senderType — never inbound/contact
    expect(mockMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv-1',
        content: 'Hola, gracias por tu interés',
        type: 'text',
        direction: 'outbound',
        senderType: 'human',
        externalId: 'wamid-123',
      }),
      select: { id: true },
    })

    expect(mockConversationUpdate).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: expect.objectContaining({
        lastMessagePreview: 'Hola, gracias por tu interés',
      }),
    })

    expect(mockContactUpdate).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: expect.objectContaining({ lastMessageAt: expect.any(Date) }),
    })
  })

  it('persists with senderType=human even when contactId is null (group chats, etc.)', async () => {
    mockRoutedSendText.mockResolvedValueOnce({ success: true, messageId: 'wamid-456' })
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg-2' })
    mockConversationUpdate.mockResolvedValueOnce({})

    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')

    const result = await sendOperatorMessage({
      workspaceId: 'ws-1',
      phone: '5215551234567',
      message: 'Hello',
      conversationId: 'conv-2',
      // no contactId
    })

    expect(result.success).toBe(true)
    expect(mockMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: 'outbound',
        senderType: 'human',
        externalId: 'wamid-456',
      }),
      select: { id: true },
    })
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })

  it('uses channel-router for Meta workspaces (returns success=true, persists, does not touch Baileys directly)', async () => {
    // The router handles the Baileys vs Meta decision internally.
    // From the helper's perspective it is a black box; we just verify
    // the helper delegates to it.
    mockRoutedSendText.mockResolvedValueOnce({ success: true, messageId: 'meta-wamid-1' })
    mockMessageCreate.mockResolvedValueOnce({ id: 'msg-meta' })
    mockConversationUpdate.mockResolvedValueOnce({})

    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')

    const result = await sendOperatorMessage({
      workspaceId: 'ws-meta',
      phone: '5215559999999',
      message: 'Meta test',
      conversationId: 'conv-meta',
      contactId: 'contact-meta',
    })

    expect(result.success).toBe(true)
    expect(result.delivered).toBe(true)
    expect(result.messageId).toBe('meta-wamid-1')
    // Delegated to router with the workspaceId
    expect(mockRoutedSendText).toHaveBeenCalledWith('ws-meta', '5215559999999', 'Meta test')
  })

  it('returns success=false, delivered=false, persisted=false when channel send fails (no DB write)', async () => {
    mockRoutedSendText.mockResolvedValueOnce({ success: false, error: 'WhatsApp not connected' })

    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')

    const result = await sendOperatorMessage({
      workspaceId: 'ws-1',
      phone: '5215551234567',
      message: 'Should not persist',
      conversationId: 'conv-1',
      contactId: 'contact-1',
    })

    expect(result.success).toBe(false)
    expect(result.delivered).toBe(false)
    expect(result.persisted).toBe(false)
    expect(result.error).toBe('WhatsApp not connected')
    expect(mockMessageCreate).not.toHaveBeenCalled()
    expect(mockConversationUpdate).not.toHaveBeenCalled()
    expect(mockContactUpdate).not.toHaveBeenCalled()
  })

  it('returns success=true but persisted=false when the channel send succeeds and the DB write fails', async () => {
    mockRoutedSendText.mockResolvedValueOnce({ success: true, messageId: 'wamid-x' })
    mockMessageCreate.mockRejectedValueOnce(new Error('MySQL down'))

    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')

    const result = await sendOperatorMessage({
      workspaceId: 'ws-1',
      phone: '5215551234567',
      message: 'Hello',
      conversationId: 'conv-1',
    })

    // Customer got the WhatsApp message — operator did not lose it
    expect(result.success).toBe(true)
    expect(result.delivered).toBe(true)
    expect(result.persisted).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('rejects empty messages before touching the channel', async () => {
    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')
    await expect(
      sendOperatorMessage({
        workspaceId: 'ws-1',
        phone: '5215551234567',
        message: '   ',
        conversationId: 'conv-1',
      }),
    ).rejects.toThrow(/message is required/)
    expect(mockRoutedSendText).not.toHaveBeenCalled()
  })

  it('rejects missing conversationId', async () => {
    const { sendOperatorMessage } = await import('@/lib/whatsapp/operator-send')
    await expect(
      sendOperatorMessage({
        workspaceId: 'ws-1',
        phone: '5215551234567',
        message: 'Hello',
        conversationId: '',
      } as any),
    ).rejects.toThrow(/conversationId is required/)
    expect(mockRoutedSendText).not.toHaveBeenCalled()
  })
})
