// ═══════════════════════════════════════════════════════════════
// Envío MULTICANAL a un lead: WhatsApp o Telegram según el "canal preferido"
// del lead (contrato A.2.7 §2b y §Pantalla 5). Un lead que escribió por
// Telegram tiene phone = "tg:<chatId>"; uno de WhatsApp tiene teléfono real.
// El usuario puede fijar customFields.preferredChannel = 'whatsapp' | 'telegram'.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import type { MetaTemplateComponent } from '@/lib/whatsapp/meta-api'

export type LeadChannel = 'whatsapp' | 'telegram'

export interface ContactLike {
  id?: string | null
  firstName?: string | null
  phone?: string | null
  customFields?: string | null
}

// Resuelve si un envío a WhatsApp debe ir como PLANTILLA aprobada de Meta: solo
// cuando el canal activo del workspace es Meta Y la ventana de 24h está cerrada
// (fuera de 24h Meta exige plantilla). Usa la plantilla asignada a la acción
// (settings.whatsappTemplateActions[action]) y rellena {{1}} con el nombre.
// Devuelve null si debe enviarse texto normal.
async function resolveMetaActionTemplate(
  workspaceId: string,
  contact: ContactLike,
  action: string,
): Promise<{ name: string; language: string; components?: MetaTemplateComponent[] } | null> {
  try {
    const { getActiveChannel } = await import('@/lib/whatsapp/channel-router')
    if ((await getActiveChannel(workspaceId)) !== 'meta') return null
    if (!contact.id) return null

    // Ventana de 24h: si hubo un mensaje ENTRANTE en las últimas 24h, se puede
    // mandar texto libre (sesión abierta). Fuera de eso → plantilla.
    const convo = await db.conversation.findFirst({ where: { workspaceId, contactId: contact.id }, orderBy: { lastMessageAt: 'desc' }, select: { id: true } })
    if (convo) {
      const recentInbound = await db.message.findFirst({
        where: { conversationId: convo.id, direction: 'inbound', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        select: { id: true },
      })
      if (recentInbound) return null // sesión abierta → texto normal
    }

    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const assign = ((s.whatsappTemplateActions as Record<string, { name: string; language: string }>) || {})[action]
    if (!assign?.name) return null // no hay plantilla asignada → intentar texto (Meta puede rechazarlo, se registra)

    // Cuántas variables tiene la plantilla (para rellenar {{1}}, {{2}}…).
    const tplRow = await db.metaMessageTemplate.findFirst({ where: { workspaceId, name: assign.name }, select: { components: true } })
    let varCount = 0
    try {
      const comps = JSON.parse(tplRow?.components || '[]') as Array<{ type?: string; text?: string }>
      const body = comps.find((c) => (c.type || '').toUpperCase() === 'BODY')
      varCount = ((body?.text || '').match(/\{\{\s*\d+\s*\}\}/g) || []).length
    } catch { /* */ }

    let components: MetaTemplateComponent[] | undefined
    if (varCount > 0) {
      const first = contact.firstName || 'hola'
      const params = Array.from({ length: varCount }, () => ({ type: 'text' as const, text: first }))
      components = [{ type: 'body', parameters: params }]
    }
    return { name: assign.name, language: assign.language || 'es_MX', components }
  } catch { return null }
}

/** Resuelve por qué canal contactar al lead y a qué dirección (teléfono o chatId de Telegram). */
export function resolveLeadChannel(contact: ContactLike): { channel: LeadChannel; address: string } | null {
  let cf: Record<string, unknown> = {}
  try { cf = JSON.parse(contact.customFields || '{}') } catch { /* */ }
  const pref = String(cf.preferredChannel || '').toLowerCase()
  const phone = (contact.phone || '').trim()
  const isTgIdentity = phone.startsWith('tg:')
  const tgChatId = (cf.telegramChatId as string | undefined) || (isTgIdentity ? phone.slice(3) : '')
  const waPhone = phone && !isTgIdentity ? phone : ''

  // 1) Preferencia explícita del usuario, si el canal está disponible.
  if (pref === 'telegram' && tgChatId) return { channel: 'telegram', address: tgChatId }
  if (pref === 'whatsapp' && waPhone) return { channel: 'whatsapp', address: waPhone }
  // 2) Auto: según cómo llegó el lead.
  if (isTgIdentity && tgChatId) return { channel: 'telegram', address: tgChatId }
  if (waPhone) return { channel: 'whatsapp', address: waPhone }
  if (tgChatId) return { channel: 'telegram', address: tgChatId }
  return null
}

/**
 * Envía un mensaje a un lead por su canal preferido. Devuelve el resultado y el
 * canal usado. Reutiliza el manager de WhatsApp (persistente + efímero) para WA
 * y el Bot API para Telegram (token del workspace).
 */
export async function sendToLead(
  workspaceId: string,
  contact: ContactLike,
  text: string,
  opts?: { action?: string },
): Promise<{ success: boolean; channel?: LeadChannel; id?: string; error?: string }> {
  const target = resolveLeadChannel(contact)
  if (!target) return { success: false, error: 'El lead no tiene WhatsApp ni Telegram' }

  // Fuera de la ventana de 24h en el canal Meta: manda la PLANTILLA aprobada
  // asignada a la acción (Meta rechaza texto libre fuera de 24h). §A.2.5.
  if (target.channel === 'whatsapp' && opts?.action) {
    const tpl = await resolveMetaActionTemplate(workspaceId, contact, opts.action)
    if (tpl) {
      const { routedSendTemplate } = await import('@/lib/whatsapp/channel-router')
      const r = await routedSendTemplate(workspaceId, target.address, tpl.name, tpl.language, tpl.components)
      if (r.success) return { success: true, channel: 'whatsapp', id: r.messageId }
      // si la plantilla falla, continúa e intenta texto (mejor intento).
    }
  }

  if (target.channel === 'telegram') {
    const { getWorkspaceTelegramConfig, sendTelegramNotification } = await import('@/lib/telegram')
    const { botToken } = await getWorkspaceTelegramConfig(workspaceId)
    if (!botToken) return { success: false, channel: 'telegram', error: 'Telegram no está conectado' }
    const r = await sendTelegramNotification(target.address, text, 'HTML', botToken)
    return { success: r.ok, channel: 'telegram', error: r.error }
  }

  // WhatsApp: canal ACTIVO del workspace (Baileys o Meta Cloud API) vía el
  // router — así se respeta waChannel='meta' (contrato §1e: "Baileys + Meta
  // Cloud API"). Si el canal principal falla (sesión Baileys caída), se intenta
  // el envío efímero como respaldo.
  const { routedSendText } = await import('@/lib/whatsapp/channel-router')
  const r = await routedSendText(workspaceId, target.address, text)
  if (r.success) return { success: true, channel: 'whatsapp', id: r.messageId, error: undefined }
  const { getWhatsAppManager } = await import('@/lib/whatsapp/connection')
  const { ephemeralManager } = await import('@/lib/whatsapp/ephemeral-client')
  const mgr = getWhatsAppManager(workspaceId)
  const eph = await ephemeralManager.sendAny(
    target.address,
    text,
    (p: string, t: string) => mgr.sendMessage(p, t),
    { workspaceId },
  )
  return { success: eph.success, channel: 'whatsapp', id: eph.id, error: eph.error || r.error }
}

/** Etiqueta legible del canal preferido de un lead (para UI). */
export async function leadChannelLabel(contactId: string): Promise<LeadChannel | null> {
  const c = await db.contact.findUnique({ where: { id: contactId }, select: { phone: true, customFields: true } })
  if (!c) return null
  return resolveLeadChannel(c)?.channel ?? null
}
