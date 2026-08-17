// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta Cloud API Webhook
// GET  /api/whatsapp/meta/webhook  → Hub challenge verification
// POST /api/whatsapp/meta/webhook  → Receive inbound messages
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processMessageCore } from '@/lib/ai/message-processor'
import { isDuplicateMessage } from '@/lib/whatsapp/shared-dedup'
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  extractMetaMessageText,
  sendMetaTextMessage,
  markMetaMessageRead,
  type MetaWebhookEntry,
} from '@/lib/whatsapp/meta-api'
import { logInfo, logError, logWarn } from '@/lib/logger'
import { understandMedia } from '@/lib/ai/media-understanding'

const GRAPH = 'https://graph.facebook.com/v19.0'

// Descarga la media entrante de Meta (imagen/audio/video/doc) y la convierte a
// texto que la IA entiende (misma capacidad multimodal que Baileys). Antes el
// canal Meta recibía las imágenes como "[Imagen]" y el bot no las "veía".
async function understandMetaMedia(
  msg: { type: string; image?: { id: string; mime_type?: string; caption?: string }; audio?: { id: string; mime_type?: string }; video?: { id: string; mime_type?: string; caption?: string }; document?: { id: string; mime_type?: string; filename?: string; caption?: string } },
  config: { accessToken: string; workspaceId: string },
): Promise<string | null> {
  const map: Record<string, { id?: string; mime_type?: string; filename?: string; caption?: string } | undefined> = {
    image: msg.image, audio: msg.audio, video: msg.video, document: msg.document,
  }
  const part = map[msg.type]
  const kind = (msg.type === 'video' ? 'video' : msg.type) as 'image' | 'audio' | 'video' | 'document'
  if (!part?.id) return null
  // 1) obtener la URL de descarga de la media
  const metaRes = await fetch(`${GRAPH}/${part.id}?access_token=${config.accessToken}`)
  const meta = await metaRes.json() as { url?: string; mime_type?: string }
  if (!meta.url) return null
  // 2) descargar los bytes (requiere Bearer)
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.accessToken}` } })
  if (!bin.ok) return null
  const buf = Buffer.from(await bin.arrayBuffer())
  // 3) keys de visión/transcripción del workspace (fallback a env)
  let mediaKeys: { groq?: string; openai?: string } = {}
  try {
    const ws = await db.workspace.findUnique({ where: { id: config.workspaceId }, select: { settings: true } })
    const ak = JSON.parse(ws?.settings || '{}').apiKeys || {}
    mediaKeys = { groq: ak.groq, openai: ak.openai }
  } catch { /* usa env */ }
  return understandMedia(buf, {
    type: kind, mimeType: part.mime_type || meta.mime_type || 'application/octet-stream',
    fileName: part.filename || `${kind}.bin`, caption: part.caption,
  }, mediaKeys)
}

// ─── GET — Hub Challenge Verification ────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const verifyToken = params.get('hub.verify_token')

  if (!verifyToken) {
    return new NextResponse('Missing verify token', { status: 400 })
  }

  // Look up which workspace has this verify token (phoneNumberId used as verify token seed)
  // Meta sends hub.verify_token = the webhookSecret we registered
  const config = await db.metaApiConfig.findFirst({
    where: { webhookSecret: verifyToken },
    select: { id: true, workspaceId: true },
  })

  if (!config) {
    return new NextResponse('Verify token not found', { status: 403 })
  }

  const challenge = verifyMetaWebhookChallenge(params, verifyToken)
  if (!challenge) {
    return new NextResponse('Invalid verification request', { status: 403 })
  }

  return new NextResponse(challenge, { status: 200 })
}

// ─── POST — Receive Messages ──────────────────────────────────

export async function POST(req: NextRequest) {
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }

  let payload: { object: string; entry: MetaWebhookEntry[] }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  if (payload.object !== 'whatsapp_business_account') {
    return new NextResponse('Not a WhatsApp event', { status: 400 })
  }

  // Process each entry (usually just one)
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue
      const { metadata, messages, contacts, statuses } = change.value

      // Handle delivery/read receipts (no processing needed)
      if (statuses && statuses.length > 0) continue

      if (!messages || messages.length === 0) continue

      const phoneNumberId = metadata.phone_number_id

      // Find workspace config for this phone number
      const config = await db.metaApiConfig.findFirst({
        where: { phoneNumberId, isActive: true },
        select: {
          id: true,
          workspaceId: true,
          accessToken: true,
          phoneNumberId: true,
          webhookSecret: true,
        },
      })

      if (!config) {
        logWarn('WHATSAPP', `[Meta Webhook] No active config for phoneNumberId: ${phoneNumberId}`)
        continue
      }

      // Verify HMAC signature (use app secret = webhookSecret)
      const sig = req.headers.get('x-hub-signature-256')
      if (!verifyMetaWebhookSignature(rawBody, sig, config.webhookSecret)) {
        logWarn('WHATSAPP', `[Meta Webhook] Signature mismatch for workspace: ${config.workspaceId}`)
        // Return 200 anyway to prevent Meta retry storms, but skip processing
        continue
      }

      // Process each incoming message
      for (const msg of messages) {
        // Skip if duplicate (dedup by message ID)
        if (isDuplicateMessage(msg.id)) continue

        let text = extractMetaMessageText(msg)
        // Media entrante (imagen/audio/video/doc): descargar y ENTENDER, para que
        // el bot la "vea"/"escuche" como en Baileys (antes llegaba como "[Imagen]").
        if (['image', 'audio', 'video', 'document'].includes(msg.type)) {
          try {
            const understood = await understandMetaMedia(msg, config)
            if (understood) text = understood
          } catch (e) { logError('WHATSAPP', '[Meta Webhook] media understanding failed', e) }
        }
        if (!text) continue  // skip reactions, unsupported types

        // Mark as read (best-effort, non-blocking)
        void markMetaMessageRead(config.phoneNumberId, config.accessToken, msg.id)

        const senderPhone = msg.from  // e.g. "521234567890"
        const senderName = contacts?.find(c => c.wa_id === msg.from)?.profile?.name ?? ''

        try {
          const result = await processMessageCore({
            text,
            phone: senderPhone,
            pushName: senderName,
            remoteJid: `${senderPhone}@s.whatsapp.net`,
            externalId: msg.id,
            channel: 'whatsapp',
            workspaceId: config.workspaceId,
            messageType: msg.type,
          })

          // Send AI reply if generated
          if (result.aiReplyText) {
            const sendResult = await sendMetaTextMessage(
              config.phoneNumberId,
              config.accessToken,
              senderPhone,
              result.aiReplyText
            )
            if (!sendResult.success) {
              logError('WHATSAPP', '[Meta Webhook] Send reply failed', sendResult.error)
            }
          }
        } catch (err) {
          logError('WHATSAPP', '[Meta Webhook] processMessageCore error', err)
        }
      }
    }
  }

  // Always return 200 to acknowledge receipt (Meta retries on non-200)
  return NextResponse.json({ status: 'ok' })
}
