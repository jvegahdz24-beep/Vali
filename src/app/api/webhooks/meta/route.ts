// ═══════════════════════════════════════════════════════════════
// Webhook de Meta (Instagram DM + Facebook Messenger)
// GET  — verificación del webhook (hub.challenge)
// POST — recibe mensajes entrantes → pipeline de IA → responde
// Resuelve el workspace por pageId/igAccountId (multi-tenant seguro).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { parseMetaWebhook, sendMetaMessage } from '@/lib/meta/messenger'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/meta-api'
import { processMessageCore } from '@/lib/ai/message-processor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Dedup en memoria (evita doble respuesta si Meta reintenta)
const MAX_META_BODY_BYTES = 1_000_000
const _seen = new Map<string, number>()
function isDup(id?: string): boolean {
  if (!id) return false
  const now = Date.now()
  for (const [k, t] of _seen) if (now - t > 10 * 60_000) _seen.delete(k)
  if (_seen.has(id)) return true
  _seen.set(id, now)
  return false
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const verifyToken = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge') || ''
  if (mode === 'subscribe' && verifyToken) {
    const ch = await db.metaChannel.findFirst({ where: { verifyToken, isActive: true } }).catch(() => null)
    if (ch) return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => '')
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_META_BODY_BYTES) {
    return new Response('Bad request', { status: 400 })
  }

  // Meta firma el cuerpo completo con la app secret. Nunca se debe parsear ni
  // procesar un evento antes de validar esta firma.
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error('[MetaWebhook] META_APP_SECRET no configurado')
    return new Response('Webhook unavailable', { status: 503 })
  }
  if (!verifyMetaWebhookSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    return new Response('Forbidden', { status: 403 })
  }

  const body = JSON.parse(rawBody) as unknown
  // Meta exige un 200 rápido: procesamos en segundo plano (server persistente PM2).
  void processMetaEvents(body).catch((e) => console.error('[MetaWebhook] error:', e))
  return new Response('EVENT_RECEIVED', { status: 200 })
}

async function processMetaEvents(body: unknown): Promise<void> {
  const msgs = parseMetaWebhook(body)
  for (const m of msgs) {
    if (m.echo) continue
    if (isDup(m.messageId)) continue
    // Resolver el canal → workspace
    const ch = m.platform === 'instagram'
      ? await db.metaChannel.findFirst({ where: { isActive: true, OR: [{ igAccountId: m.pageOrIgId }, { pageId: m.pageOrIgId }] } }).catch(() => null)
      : await db.metaChannel.findUnique({ where: { pageId: m.pageOrIgId } }).catch(() => null)
    if (!ch || !ch.isActive) {
      console.warn(`[MetaWebhook] sin canal para ${m.platform} id=${m.pageOrIgId}`)
      continue
    }
    try {
      const res = await processMessageCore({
        text: m.text,
        phone: m.senderId, // identificador del usuario (PSID/IGSID)
        workspaceId: ch.workspaceId,
        // 'messenger' se normaliza a 'facebook' — es el valor de canal que la
        // bandeja muestra y filtra (CHANNELS en constants.ts).
        channel: m.platform === 'instagram' ? 'instagram' : 'facebook',
        externalId: m.messageId,
      })
      if (res?.aiReplyText) {
        await sendMetaMessage(ch.pageAccessToken, m.senderId, res.aiReplyText)
      }
    } catch (e) {
      console.error(`[MetaWebhook] pipeline (${m.platform}) error:`, e instanceof Error ? e.message : e)
    }
  }
}
