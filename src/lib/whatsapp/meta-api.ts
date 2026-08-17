// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta Cloud API (WhatsApp Business API Oficial)
// Handles send, receive verification, and template management
// Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto'

const META_API_BASE = 'https://graph.facebook.com/v19.0'

// ─── Types ────────────────────────────────────────────────────

export interface MetaSendResult {
  success: boolean
  messageId?: string
  error?: string
  statusCode?: number
}

export interface MetaTemplateComponent {
  type: 'header' | 'body' | 'footer' | 'button'
  format?: 'text' | 'image' | 'document' | 'video'
  text?: string
  parameters?: MetaTemplateParameter[]
  sub_type?: 'quick_reply' | 'url'
  index?: number
}

export interface MetaTemplateParameter {
  type: 'text' | 'image' | 'document' | 'video' | 'currency' | 'date_time'
  text?: string
  image?: { link: string }
  document?: { link: string; filename?: string }
}

export interface MetaInboundMessage {
  from: string           // sender's WhatsApp phone number (no +)
  id: string             // message wamid
  timestamp: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'interactive' | 'reaction' | 'unsupported'
  text?: { body: string }
  image?: { id: string; mime_type: string; sha256: string; caption?: string }
  audio?: { id: string; mime_type: string }
  video?: { id: string; mime_type: string; sha256: string; caption?: string }
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string }
  interactive?: {
    type: 'button_reply' | 'list_reply'
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  reaction?: { message_id: string; emoji: string }
  referral?: { source_url: string; source_id: string; source_type: string; headline?: string; body?: string }
}

export interface MetaWebhookEntry {
  id: string   // WABA ID
  changes: Array<{
    value: {
      messaging_product: 'whatsapp'
      metadata: { display_phone_number: string; phone_number_id: string }
      contacts?: Array<{ profile: { name: string }; wa_id: string }>
      messages?: MetaInboundMessage[]
      statuses?: Array<{
        id: string
        recipient_id: string
        status: 'sent' | 'delivered' | 'read' | 'failed'
        timestamp: string
        errors?: Array<{ code: number; title: string }>
      }>
      errors?: Array<{ code: number; title: string; message: string }>
    }
    field: 'messages'
  }>
}

export interface MetaPhoneInfo {
  id: string
  display_phone_number: string
  verified_name: string
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'NA'
  platform_type: 'CLOUD_API'
  throughput: { level: string }
}

export interface MetaTemplate {
  id: string
  name: string
  status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'PAUSED' | 'IN_APPEAL' | 'DELETED'
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  components: MetaTemplateComponent[]
  rejected_reason?: string
}

// ─── Core Send Functions ──────────────────────────────────────

/**
 * Send a plain text message via Meta Cloud API
 */
export async function sendMetaTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<MetaSendResult> {
  const cleanTo = to.replace(/\D/g, '')  // strip non-digits
  try {
    const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    })
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string; code: number } }
    if (!res.ok || data.error) {
      return {
        success: false,
        statusCode: res.status,
        error: data.error?.message || `HTTP ${res.status}`,
      }
    }
    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Send an image message (by URL) via Meta Cloud API
 */
export async function sendMetaImageMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<MetaSendResult> {
  const cleanTo = to.replace(/\D/g, '')
  try {
    const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'image',
        image: { link: imageUrl, ...(caption ? { caption } : {}) },
      }),
    })
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string; code: number } }
    if (!res.ok || data.error) {
      return { success: false, statusCode: res.status, error: data.error?.message || `HTTP ${res.status}` }
    }
    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Send a pre-approved template message via Meta Cloud API
 */
export async function sendMetaTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  language: string,
  components?: MetaTemplateComponent[]
): Promise<MetaSendResult> {
  const cleanTo = to.replace(/\D/g, '')
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(components && components.length > 0 ? { components } : {}),
    },
  }
  try {
    const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string; code: number } }
    if (!res.ok || data.error) {
      return { success: false, statusCode: res.status, error: data.error?.message || `HTTP ${res.status}` }
    }
    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Mark a message as read (optional UX improvement)
 */
export async function markMetaMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  try {
    await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
  } catch { /* non-critical */ }
}

// ─── Phone Number Info ────────────────────────────────────────

/**
 * Fetch phone number info from Meta Graph API
 */
export async function getMetaPhoneInfo(
  phoneNumberId: string,
  accessToken: string
): Promise<MetaPhoneInfo | null> {
  try {
    const res = await fetch(
      `${META_API_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,throughput`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (!res.ok) return null
    return await res.json() as MetaPhoneInfo
  } catch {
    return null
  }
}

// ─── Template Management ──────────────────────────────────────

/**
 * Fetch approved templates from Meta (requires Business Account ID)
 */
export async function getMetaTemplates(
  businessId: string,
  accessToken: string
): Promise<MetaTemplate[]> {
  try {
    const res = await fetch(
      `${META_API_BASE}/${businessId}/message_templates?fields=id,name,status,category,language,components,rejected_reason&limit=100`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (!res.ok) return []
    const data = await res.json() as { data?: MetaTemplate[] }
    return data.data || []
  } catch {
    return []
  }
}

/**
 * Crea (y envía a revisión de Meta) una plantilla nueva. Devuelve el id + estado
 * inicial (normalmente PENDING). Meta la revisa y luego queda APPROVED/REJECTED.
 */
export async function createMetaTemplate(
  businessId: string,
  accessToken: string,
  tpl: { name: string; category: string; language: string; components: Record<string, unknown>[] }
): Promise<{ success: boolean; id?: string; status?: string; error?: string }> {
  try {
    const res = await fetch(`${META_API_BASE}/${businessId}/message_templates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tpl.name, category: tpl.category, language: tpl.language, components: tpl.components }),
    })
    const j = await res.json() as { id?: string; status?: string; error?: { message?: string; error_user_msg?: string } }
    if (!res.ok || j.error) return { success: false, error: j.error?.error_user_msg || j.error?.message || 'Meta rechazó la plantilla' }
    return { success: true, id: j.id, status: j.status || 'PENDING' }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error al crear plantilla' }
  }
}

/** Elimina una plantilla de Meta por nombre (borra todos sus idiomas). */
export async function deleteMetaTemplate(
  businessId: string,
  accessToken: string,
  name: string,
  metaId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const qs = new URLSearchParams({ name })
    if (metaId) qs.set('hsm_id', metaId)
    const res = await fetch(`${META_API_BASE}/${businessId}/message_templates?${qs.toString()}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    const j = await res.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
    if (!res.ok || j.error) return { success: false, error: j.error?.message || 'No se pudo eliminar en Meta' }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error al eliminar plantilla' }
  }
}

// ─── Webhook Verification ─────────────────────────────────────

/**
 * Verify Meta webhook hub challenge (GET request from Meta during setup)
 */
export function verifyMetaWebhookChallenge(
  searchParams: URLSearchParams,
  verifyToken: string
): string | null {
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === verifyToken) return challenge
  return null
}

/**
 * Verify X-Hub-Signature-256 header from Meta webhook POST
 * Throws if invalid, returns true if valid
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')}`
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    )
  } catch {
    return false
  }
}

// ─── Message Text Extractor ───────────────────────────────────

/**
 * Extract displayable text from a Meta inbound message
 */
export function extractMetaMessageText(msg: MetaInboundMessage): string | null {
  if (msg.type === 'text' && msg.text?.body) return msg.text.body
  if (msg.type === 'image') return msg.image?.caption ? `[Imagen] ${msg.image.caption}` : '[Imagen]'
  if (msg.type === 'audio') return '[Nota de voz]'
  if (msg.type === 'video') return msg.video?.caption ? `[Video] ${msg.video.caption}` : '[Video]'
  if (msg.type === 'document') return msg.document?.filename ? `[Documento] ${msg.document.filename}` : '[Documento]'
  if (msg.type === 'sticker') return '[Sticker]'
  if (msg.type === 'location') return '[Ubicación compartida]'
  if (msg.type === 'interactive') {
    if (msg.interactive?.button_reply) return msg.interactive.button_reply.title
    if (msg.interactive?.list_reply) return msg.interactive.list_reply.title
  }
  if (msg.type === 'reaction') return null  // ignore reactions
  return null
}
