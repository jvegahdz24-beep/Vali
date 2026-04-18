// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Webhook (Evolution API compatible)
// POST /api/webhooks/whatsapp — Receives messages from Evolution API
//
// UNIFIED: This route is a FORWARDER only.
// All DB + AI logic lives in processMessageCore().
// This file only parses the Evolution API format → processMessageCore()
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { processMessageCore } from '@/lib/ai/message-processor'

// ─── Webhook Deduplication (Fix P0) ──────────────────────────
// Evolution API may send the same webhook event multiple times (retries).
// This Set tracks processed message IDs and auto-expires entries older
// than 10 minutes to prevent unbounded memory growth.
const _processedMessageIds = new Set<string>()
const DEDUP_TTL_MS = 10 * 60 * 1000 // 10 minutes
let _lastDedupCleanup = Date.now()

function isDuplicate(messageId: string): boolean {
  // Periodic cleanup: remove entries older than DEDUP_TTL_MS
  const now = Date.now()
  if (now - _lastDedupCleanup > DEDUP_TTL_MS) {
    // Since Set doesn't store timestamps, we clear the entire set.
    // This is safe because Evolution API retries happen within seconds,
    // not after 10 minutes. The worst case is one extra processing of
    // a message that arrived >10min ago (which is acceptable).
    _processedMessageIds.clear()
    _lastDedupCleanup = now
    console.log('[Webhook] Dedup cache cleared (TTL sweep)')
  }

  if (_processedMessageIds.has(messageId)) {
    console.log(`[Webhook] Duplicate message ignored: ${messageId}`)
    return true
  }

  _processedMessageIds.add(messageId)
  return false
}

// Evolution API message format
interface EvolutionMessage {
  instance: string
  event: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
      id: string
    }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text?: string }
      imageMessage?: { caption?: string }
    }
    messageType?: string
    messageTimestamp?: number
  }
}

function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0]
}

function extractMessageText(data: EvolutionMessage['data']): string | null {
  if (!data.message) return null
  if (data.message.conversation) return data.message.conversation
  if (data.message.extendedTextMessage?.text) return data.message.extendedTextMessage.text
  if (data.message.imageMessage?.caption) return `[Imagen] ${data.message.imageMessage.caption}`
  return null
}

// ─── Webhook Secret Verification ─────────────────────────────
function verifyWebhookSecret(req: NextRequest): boolean {
  const configuredSecret = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET
  if (!configuredSecret) return true
  const incomingSecret = req.headers.get('x-webhook-secret')
  if (!incomingSecret) return false
  const a = Buffer.from(configuredSecret)
  const b = Buffer.from(incomingSecret)
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) { result |= a[i] ^ b[i] }
  return result === 0
}

export async function POST(req: NextRequest) {
  try {
    // Webhook secret verification
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json({ error: 'Invalid or missing webhook secret' }, { status: 403 })
    }

    const body: EvolutionMessage = await req.json()

    // Only process message events
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ received: true, event: body.event })
    }

    const { data } = body
    if (!data || data.key?.fromMe) {
      return NextResponse.json({ received: true, skipped: true })
    }

    // FIX P0: Deduplicate — reject if we already processed this exact message ID
    const messageId = data.key?.id
    if (messageId && isDuplicate(messageId)) {
      return NextResponse.json({ received: true, skipped: 'duplicate', messageId })
    }

    const phone = extractPhoneFromJid(data.key.remoteJid)
    const messageText = extractMessageText(data)

    if (!messageText) {
      return NextResponse.json({ received: true, skipped: 'no_text' })
    }

    // ── FORWARD to processMessageCore (single source of truth) ──
    const result = await processMessageCore({
      text: messageText,
      phone,
      pushName: data.pushName,
      remoteJid: data.key.remoteJid,
      externalId: data.key.id,
      channel: 'whatsapp',
    })

    return NextResponse.json({
      success: true,
      message: 'Webhook processed',
      conversationId: result.conversationId,
      contactId: result.contactId,
      aiResponse: result.aiReplyText,
      analysis: {
        action: result.engineResult.action,
        strategy: result.engineResult.strategy,
        agentRouting: result.engineResult.agentRouting,
      },
    })
  } catch (error) {
    console.error('[Webhook Error]', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'active', service: 'ValiAutoFlow WhatsApp Webhook' })
}
