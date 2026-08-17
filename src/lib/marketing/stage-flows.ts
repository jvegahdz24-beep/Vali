// ═══════════════════════════════════════════════════════════════
// Motor de FLUJOS POR ETAPA del pipeline (contrato A.2.7 §2c).
// Cuando un lead cambia de etapa, se ejecutan las MarketingAutomation con
// trigger 'pipeline_stage' cuyo valor coincide con la nueva etapa: se envía el
// mensaje configurado (bienvenida/seguimiento/cierre/postventa) por el canal
// preferido del lead (WhatsApp o Telegram). Antes esto NO se ejecutaba.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { sendToLead } from './lead-channel'

const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()

export async function runStageFlows(
  workspaceId: string,
  contactId: string | null | undefined,
  newStageName: string | null | undefined,
  newStageId: string | null | undefined,
): Promise<{ ran: number }> {
  if (!contactId) return { ran: 0 }
  const autos = await db.marketingAutomation.findMany({
    where: { workspaceId, isActive: true, trigger: 'pipeline_stage', action: 'send_whatsapp' },
  })
  if (!autos.length) return { ran: 0 }

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, firstName: true, lastName: true, phone: true, customFields: true },
  })
  if (!contact) return { ran: 0 }

  // No molestar a quien pidió no escribir / IA apagada.
  try {
    const cf = JSON.parse(contact.customFields || '{}') as Record<string, unknown>
    let tags: string[] = []
    const c2 = await db.contact.findUnique({ where: { id: contactId }, select: { tags: true } })
    try { tags = JSON.parse(c2?.tags || '[]') } catch { /* */ }
    if (cf.aiDisabled || tags.some((t) => t.startsWith('noqualify')) || tags.includes('descartado')) return { ran: 0 }
  } catch { /* */ }

  const stageLc = norm(newStageName)
  let ran = 0

  for (const a of autos) {
    const tv = norm(a.triggerValue)
    // Coincide por nombre de etapa o por id de etapa.
    if (tv && tv !== stageLc && a.triggerValue !== newStageId) continue

    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(a.actionConfig || '{}') } catch { /* */ }
    let msg = String(cfg.message || cfg.messageTemplate || '').trim()
    if (!msg) continue
    msg = msg
      .replace(/\{\{\s*(name|nombre|firstName)\s*\}\}/gi, contact.firstName || 'hola')
      .replace(/\{\{\s*(lastName|apellido)\s*\}\}/gi, contact.lastName || '')

    // Conversación del contacto (para registrar y anti-duplicado).
    const convo = await db.conversation.findFirst({
      where: { workspaceId, contactId }, orderBy: { lastMessageAt: 'desc' }, select: { id: true },
    })

    // Anti-duplicado: no repetir el mismo mensaje al mismo lead en 24h (evita
    // reenvíos si el trato rebota de etapa).
    if (convo) {
      const dup = await db.message.findFirst({
        where: { conversationId: convo.id, direction: 'outbound', content: msg, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        select: { id: true },
      })
      if (dup) continue
    }

    // Acción para elegir plantilla de Meta fuera de 24h (bienvenida/postventa/seguimiento).
    const act = /bienvenid|welcome/i.test(newStageName || '') ? 'welcome' : /postvent|post.?sale/i.test(newStageName || '') ? 'post_sale' : 'follow_up'
    const r = await sendToLead(workspaceId, contact, msg, { action: act }).catch(() => ({ success: false, channel: undefined as string | undefined }))
    if (!r.success) { console.warn(`[StageFlow] send_failed automation=${a.id} contact=${contactId}`); continue }

    ran++
    await db.marketingAutomation.update({ where: { id: a.id }, data: { executedCount: { increment: 1 }, lastExecuted: new Date() } }).catch(() => {})
    if (convo) {
      await db.message.create({
        data: {
          conversationId: convo.id, content: msg, type: 'text', direction: 'outbound', senderType: 'agent',
          senderId: 'stage-flow', isAiGenerated: false, status: 'sent',
          metadata: JSON.stringify({ source: 'stage-flow', automationId: a.id, stage: newStageName, channel: r.channel, automated: true }),
        },
      }).catch(() => {})
      await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), lastMessagePreview: msg.slice(0, 100) } }).catch(() => {})
    }
    console.log(`[StageFlow] sent automation=${a.id} contact=${contactId} stage=${newStageName} channel=${r.channel}`)
  }

  return { ran }
}
