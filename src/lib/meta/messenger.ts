// ═══════════════════════════════════════════════════════════════
// Meta (Instagram DM + Facebook Messenger) — envío por Graph API.
// El webhook recibe los mensajes; esta función envía las respuestas.
// ═══════════════════════════════════════════════════════════════

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface MetaSendResult { success: boolean; error?: string; messageId?: string }

/**
 * Envía un mensaje de texto a un usuario de Messenger o Instagram usando el
 * Page Access Token. recipientId es el PSID (Messenger) o IGSID (Instagram).
 */
export async function sendMetaMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string,
): Promise<MetaSendResult> {
  if (!pageAccessToken || !recipientId || !text) return { success: false, error: 'missing_params' }
  try {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text.slice(0, 1900) },
        messaging_type: 'RESPONSE',
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: j?.error?.message || `HTTP ${res.status}` }
    return { success: true, messageId: j?.message_id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'network' }
  }
}

// ── Parser de eventos del webhook (Messenger + Instagram) ──
// Devuelve una lista normalizada de mensajes entrantes de texto.
export interface IncomingMetaMessage {
  platform: 'messenger' | 'instagram'
  pageOrIgId: string // entry.id — pageId (messenger) o igAccountId (instagram)
  senderId: string   // PSID / IGSID
  text: string
  messageId?: string
  echo: boolean      // true si es un eco (mensaje enviado por la página) → ignorar
}

export function parseMetaWebhook(body: any): IncomingMetaMessage[] {
  const out: IncomingMetaMessage[] = []
  if (!body || !Array.isArray(body.entry)) return out
  const platform: 'messenger' | 'instagram' = body.object === 'instagram' ? 'instagram' : 'messenger'
  for (const entry of body.entry) {
    const pageOrIgId = String(entry.id || '')
    const events = Array.isArray(entry.messaging) ? entry.messaging : []
    for (const ev of events) {
      const msg = ev.message
      if (!msg) continue
      const echo = !!msg.is_echo
      const text = typeof msg.text === 'string' ? msg.text : ''
      const senderId = String(ev.sender?.id || '')
      if (!senderId || !text) continue
      out.push({ platform, pageOrIgId, senderId, text, messageId: msg.mid, echo })
    }
  }
  return out
}
