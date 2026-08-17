// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Operator Outbound Message Helper
//
// Used by:
//   - /api/whatsapp/send     (HTTP endpoint for the Inbox UI)
//   - any future server-side
//
// Purpose: send a message typed by a human operator to the customer
// via the workspace's active WhatsApp channel (Baileys OR Meta Cloud
// API), then persist it as an outbound message from a human sender.
//
// CRITICAL: this is the single source of truth for "operator →
// customer" delivery. Do NOT route operator messages through
// processMessageCore (which is for inbound messages from customers
// arriving on the Baileys webhook / Meta webhook / webchat). Doing
// so would save the operator's text as a fake "inbound from the
// contact" message and break the inbox UI.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { routedSendText } from '@/lib/whatsapp/channel-router'

export interface SendOperatorMessageInput {
  workspaceId: string
  phone: string
  message: string
  conversationId: string
  contactId?: string | null
}

export interface SendOperatorMessageResult {
  success: boolean
  messageId?: string
  error?: string
  /** True when the message was delivered to the WhatsApp channel */
  delivered: boolean
  /** True when the message was persisted to the DB */
  persisted: boolean
  /** The created Message row id, if persisted */
  dbMessageId?: string
}

/**
 * Send a message authored by a human operator to the customer and
 * persist it as `direction='outbound'` + `senderType='human'`.
 *
 * Routing:
 *   - Uses routedSendText → Baileys or Meta Cloud API based on
 *     Workspace.waChannel + MetaApiConfig.
 *   - Does NOT call processMessageCore, so the text is never
 *     double-saved as an inbound message from the contact.
 *
 * Failure semantics:
 *   - If the channel send fails (success=false), the function
 *     returns success=false, delivered=false, persisted=false and
 *     does NOT touch the DB. The caller can decide whether to
 *     surface a 503 (HTTP) or a user-facing error (UI).
 *   - If the channel send succeeds but the DB persistence fails,
 *     the function still returns success=true (the customer got
 *     the message); persisted=false is informational.
 */
export async function sendOperatorMessage(
  input: SendOperatorMessageInput,
): Promise<SendOperatorMessageResult> {
  const { workspaceId, phone, message, conversationId, contactId } = input

  if (!workspaceId) throw new Error('sendOperatorMessage: workspaceId is required')
  if (!phone) throw new Error('sendOperatorMessage: phone is required')
  if (!message || !message.trim()) throw new Error('sendOperatorMessage: message is required')
  if (!conversationId) throw new Error('sendOperatorMessage: conversationId is required')

  // 1. Deliver through the active channel.
  //    Contactos de TELEGRAM (identidad "tg:<chatId>") se entregan por el bot
  //    de Telegram del workspace; el resto va por WhatsApp (Baileys/Meta).
  let sendResult: { success: boolean; messageId?: string; error?: string }
  if (phone.startsWith('tg:')) {
    try {
      const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
      let s: Record<string, unknown> = {}
      try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
      const botToken = (s.telegramBotToken as string | undefined) || process.env.TELEGRAM_BOT_TOKEN
      if (!botToken) {
        return { success: false, error: 'Sin bot de Telegram configurado para este workspace', delivered: false, persisted: false }
      }
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: phone.slice(3), text: message }),
      })
      const j = await r.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number } }
      sendResult = j.ok
        ? { success: true, messageId: j.result?.message_id != null ? String(j.result.message_id) : undefined }
        : { success: false, error: 'Telegram no aceptó el mensaje' }
    } catch (e) {
      sendResult = { success: false, error: e instanceof Error ? e.message : 'Error de Telegram' }
    }
  } else {
    sendResult = await routedSendText(workspaceId, phone, message)
  }
  if (!sendResult.success) {
    return {
      success: false,
      error: sendResult.error || 'Channel send failed',
      delivered: false,
      persisted: false,
    }
  }

  // 2. Persist as outbound / human — never as inbound / contact
  let dbMessageId: string | undefined
  let persisted = false
  try {
    const created = await db.message.create({
      data: {
        conversationId,
        content: message,
        type: 'text',
        direction: 'outbound',
        senderType: 'human',
        externalId: sendResult.messageId ?? undefined,
      },
      select: { id: true },
    })
    dbMessageId = created.id
    persisted = true

    await db.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: message.slice(0, 100),
      },
    })

    if (contactId) {
      await db.contact.update({
        where: { id: contactId },
        data: { lastMessageAt: new Date() },
      })
    }
  } catch (dbError) {
    // The customer already received the WhatsApp message; persistence
    // failure is non-fatal but worth flagging.
    console.error('[sendOperatorMessage] DB save error (message was still sent):', dbError)
  }

  return {
    success: true,
    messageId: sendResult.messageId,
    delivered: true,
    persisted,
    dbMessageId,
  }
}
