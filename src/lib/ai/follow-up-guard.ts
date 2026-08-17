// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Freno de follow-ups sin respuesta.
// Regla de negocio (pedida por el usuario 2026-06-30): si un contacto NO
// responde, NO seguir mandándole mensajes automáticos. Tope por defecto: 2
// follow-ups automáticos consecutivos sin respuesta → se detiene.
// Aplica a TODOS los enviadores: cron follow-ups, worker y reactivación.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logTimelineEvent } from '@/lib/erp/bitacora'

// Marcadores en message.metadata que identifican un envío AUTOMÁTICO de seguimiento
// (no una respuesta conversacional del bot ni un mensaje del operador humano).
const FOLLOWUP_MARKERS = ['cron_follow_up', 'followup-worker', 'dib-reactivation', 'reactiv', '"automated":true']

export const DEFAULT_MAX_UNANSWERED = 2

/**
 * Cuántos follow-ups AUTOMÁTICOS se enviaron al contacto SIN que haya respondido.
 * Se cuenta desde su último mensaje ENTRANTE (si nunca respondió, en toda su historia).
 * Un mensaje entrante "reinicia" el contador (el contacto volvió a interactuar).
 */
export async function unansweredFollowUps(contactId: string): Promise<number> {
  const lastInbound = await db.message.findFirst({
    where: { conversation: { contactId }, direction: 'inbound' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const outbound = await db.message.findMany({
    where: {
      conversation: { contactId },
      direction: 'outbound',
      ...(lastInbound ? { createdAt: { gt: lastInbound.createdAt } } : {}),
    },
    select: { metadata: true },
  })
  return outbound.filter((m) => {
    const meta = m.metadata || ''
    return FOLLOWUP_MARKERS.some((k) => meta.includes(k))
  }).length
}

/**
 * True si ya se enviaron >= max follow-ups automáticos sin respuesta → NO enviar más.
 * Si el workspace definió settings.maxUnansweredFollowUps, se respeta (mín 1).
 */
export async function shouldStopFollowUps(contactId: string, workspaceId?: string): Promise<boolean> {
  let max = DEFAULT_MAX_UNANSWERED
  if (workspaceId) {
    try {
      const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
      const n = JSON.parse(ws?.settings || '{}').maxUnansweredFollowUps
      if (typeof n === 'number' && n >= 1) max = n
    } catch { /* usa default */ }
  }
  return (await unansweredFollowUps(contactId)) >= max
}

/** Cancela todas las tareas de follow-up pendientes de un contacto (corta el spiral).
 *  EXENTAS: las de postventa (ruleId 'post-sale') — su público ES el cliente que ya
 *  compró; solo se cancelan explícitamente (aiDisabled/noqualify las frena el worker). */
export async function cancelPendingFollowUps(contactId: string, reason = 'sin respuesta: tope de follow-ups alcanzado'): Promise<void> {
  await db.followUpTask.updateMany({
    where: { contactId, status: { in: ['pending', 'processing'] }, ruleId: { not: 'post-sale' } },
    data: { status: 'cancelled', error: reason },
  }).catch(() => {})
}

/**
 * Marca al contacto como DESINTERESADO: no respondió tras el tope de follow-ups.
 * Tag 'desinteresado' + status 'inactive' + temperatura 'cold' + leadProfile
 * no-reactivable + registro en la bitácora. Idempotente (si ya está marcado, no hace nada).
 */
/**
 * DESCARTAR un lead (pedido por Jhon 2026-07-05, desde Telegram): detiene por
 * COMPLETO la IA para este contacto — no le vuelve a escribir ni responde
 * automáticamente, ni siquiera en una conversación nueva. Es el mismo freno que
 * usa [CRM:noqualify]: pone customFields.aiDisabled=true a nivel CONTACTO +
 * marca la conversación activa + isReactivable=false (frena el motor de
 * reactivación). Reversible desde el inbox ("Reactivar IA") o con reactivateLead.
 */
export async function discardLead(contactId: string, workspaceId: string, reason = 'descartado'): Promise<{ name: string } | null> {
  try {
    const contact = await db.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { firstName: true, lastName: true, customFields: true, tags: true },
    })
    if (!contact) return null

    let cf: Record<string, unknown> = {}
    try { cf = JSON.parse(contact.customFields || '{}') } catch { cf = {} }
    cf.aiDisabled = true
    cf.aiDisabledReason = `descartado:${reason}`
    cf.aiDisabledAt = new Date().toISOString()

    let tags: string[] = []
    try { tags = JSON.parse(contact.tags || '[]') } catch { tags = [] }
    if (!tags.includes('descartado')) tags.push('descartado')

    await db.contact.update({
      where: { id: contactId },
      data: { customFields: JSON.stringify(cf), tags: JSON.stringify(tags), status: 'inactive', temperature: 'cold' },
    })

    // Silenciar también la conversación activa (por si sigue abierta ahora mismo)
    const conv = await db.conversation.findFirst({ where: { workspaceId, contactId, status: 'active' }, select: { id: true, metadata: true } })
    if (conv) {
      let cm: Record<string, unknown> = {}
      try { cm = JSON.parse(conv.metadata || '{}') } catch { cm = {} }
      cm.aiDisabled = true
      cm.aiDisabledReason = `descartado:${reason}`
      await db.conversation.update({ where: { id: conv.id }, data: { metadata: JSON.stringify(cm) } })
    }

    // Frena el motor de reactivación (DIB) y cancela follow-ups pendientes
    await db.leadProfile.updateMany({ where: { contactId, workspaceId }, data: { isReactivable: false } }).catch(() => {})
    await cancelPendingFollowUps(contactId, 'lead descartado desde Telegram').catch(() => {})

    await logTimelineEvent({
      workspaceId, contactId, type: 'intention',
      title: 'Lead descartado — IA detenida',
      detail: `Se descartó al lead${reason && reason !== 'descartado' ? ` (${reason})` : ''}. La IA ya no le escribirá ni responderá automáticamente. Reversible desde el inbox.`,
      source: 'system', importance: 'high',
    }).catch(() => {})

    const name = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'Contacto'
    return { name }
  } catch (err) {
    console.warn('[FollowUpGuard] discardLead falló:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function markDisinterested(contactId: string, workspaceId: string): Promise<void> {
  try {
    const contact = await db.contact.findUnique({ where: { id: contactId }, select: { tags: true } })
    let tags: string[] = []
    try { tags = JSON.parse(contact?.tags || '[]') } catch { tags = [] }
    if (tags.includes('desinteresado')) return // ya marcado → no duplicar
    tags.push('desinteresado')
    await db.contact.update({
      where: { id: contactId },
      data: { tags: JSON.stringify(tags), status: 'inactive', temperature: 'cold' },
    })
    await db.leadProfile.updateMany({ where: { contactId, workspaceId }, data: { isReactivable: false } }).catch(() => {})
    await logTimelineEvent({
      workspaceId, contactId, type: 'intention',
      title: 'Cliente marcado como desinteresado',
      detail: 'No respondió tras 2 follow-ups automáticos; se detuvo el seguimiento.',
      source: 'system', importance: 'normal',
    })
  } catch (err) {
    console.warn('[FollowUpGuard] markDisinterested falló (no crítico):', err instanceof Error ? err.message : err)
  }
}
