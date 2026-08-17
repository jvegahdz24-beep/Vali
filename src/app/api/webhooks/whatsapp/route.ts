// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Webhook (Evolution API compatible)
// POST /api/webhooks/whatsapp — Receives messages from Evolution API
//
// UNIFIED: This route is a FORWARDER only.
// All DB + AI logic lives in processMessageCore().
// This file only parses the Evolution API format → processMessageCore()
//
// FIX P0+P3: Dedup now uses shared-dedup.ts (same store as connection.ts)
// so a message arriving via BOTH Baileys socket AND webhook is only
// processed ONCE.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { processMessageCore } from '@/lib/ai/message-processor'
import { isDuplicateMessage } from '@/lib/whatsapp/shared-dedup'

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
  if (!configuredSecret) return false // SEC-008: fail-closed when secret is not configured
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

    // FIX P0+P3: Dedup using shared store (same as connection.ts)
    // If Baileys already processed this message, the webhook will skip it.
    const messageId = data.key?.id
    if (messageId && isDuplicateMessage(messageId)) {
      return NextResponse.json({ received: true, skipped: 'duplicate', messageId })
    }

    const phone = extractPhoneFromJid(data.key.remoteJid)
    const messageText = extractMessageText(data)

    if (!messageText) {
      return NextResponse.json({ received: true, skipped: 'no_text' })
    }

    // ── Resolve workspace from Evolution API instance name ──
    // The "instance" field MUST match a workspace slug or ID. We refuse
    // to fall back to "latest WhatsAppAuth" because that's how a webhook
    // from tenant A's number could be misrouted to tenant B's workspace.
    let resolvedWorkspaceId: string | undefined
    try {
      const { db } = await import('@/lib/db')
      const instanceName = body.instance
      if (instanceName) {
        const bySlug = await db.workspace.findFirst({
          where: { slug: instanceName, isActive: true },
          select: { id: true }
        })
        if (bySlug) {
          resolvedWorkspaceId = bySlug.id
        } else {
          const byId = await db.workspace.findUnique({
            where: { id: instanceName },
            select: { id: true }
          })
          if (byId) resolvedWorkspaceId = byId.id
        }
      }
    } catch (wsErr) {
      console.warn('[Webhook] Workspace resolution failed:', wsErr)
    }

    if (!resolvedWorkspaceId) {
      console.warn('[Webhook] Could not resolve workspace from instance — refusing to process to prevent cross-tenant mixing')
      return NextResponse.json({ received: true, skipped: 'no_workspace_resolved' })
    }

    // ── FORWARD to processMessageCore (single source of truth) ──
    const result = await processMessageCore({
      text: messageText,
      phone,
      pushName: data.pushName,
      remoteJid: data.key.remoteJid,
      externalId: data.key.id,
      channel: 'whatsapp',
      workspaceId: resolvedWorkspaceId,
    })

    // Webhook providers only need an acknowledgement. Never return AI text,
    // contact IDs or internal routing metadata to an external caller.
    return NextResponse.json({ received: true, processed: true })
  } catch (error) {
    console.error('[Webhook Error]', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
