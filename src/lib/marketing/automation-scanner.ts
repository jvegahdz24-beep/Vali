// ═══════════════════════════════════════════════════════════════
// Evaluador de AUTOMATIZACIONES DE LEADS (contrato A.2.7 §Pantalla 4 / §2b).
// Corre en el cron de automatizaciones (cada 5 min) y dispara las
// MarketingAutomation cuyo trigger NO es por etapa:
//   • days_inactive → leads sin actividad por N días (triggerValue = "30")
//   • temperature   → por leadScore (hot ≥70, warm 40-69, cold <40)
//   • tag           → leads con la etiqueta indicada
// Envía el mensaje configurado por el canal preferido del lead (WhatsApp o
// Telegram) vía sendToLead. pipeline_stage se maneja por EVENTO en stage-flows.ts.
// Antes NINGUNO de estos tres triggers se ejecutaba (se guardaban "activa" pero
// nunca disparaban).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { sendToLead, type ContactLike } from './lead-channel'

const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()
const MAX_PER_AUTOMATION = 12 // anti-baneo: tope de envíos por automatización por corrida
const COOLDOWN_MS = 48 * 60 * 60 * 1000 // no re-contactar a un lead con otro saliente en 48h
const REPEAT_MS = 7 * 24 * 60 * 60 * 1000 // no re-disparar la MISMA automatización al mismo lead en 7 días

interface Cand { id: string; firstName: string | null; lastName: string | null; phone: string | null; customFields: string | null; tags: string | null }
const SELECT = { id: true, firstName: true, lastName: true, phone: true, customFields: true, tags: true }

async function matchContacts(workspaceId: string, trigger: string, triggerValue: string): Promise<Cand[]> {
  const tv = triggerValue || ''
  if (trigger === 'days_inactive') {
    const days = Math.max(1, parseInt(tv, 10) || 30)
    const cutoff = new Date(Date.now() - days * 86400000)
    return db.contact.findMany({
      where: { workspaceId, lastMessageAt: { lte: cutoff } },
      select: SELECT, take: 80, orderBy: { lastMessageAt: 'asc' },
    })
  }
  if (trigger === 'temperature') {
    const t = norm(tv)
    let scoreWhere: Record<string, unknown> = {}
    if (t === 'hot' || t === 'caliente') scoreWhere = { leadScore: { gte: 70 } }
    else if (t === 'warm' || t === 'tibio' || t === 'templado') scoreWhere = { leadScore: { gte: 40, lt: 70 } }
    else if (t === 'cold' || t === 'frio' || t === 'frío') scoreWhere = { leadScore: { lt: 40 } }
    else return []
    return db.contact.findMany({ where: { workspaceId, ...scoreWhere }, select: SELECT, take: 80 })
  }
  if (trigger === 'tag') {
    if (!tv.trim()) return []
    return db.contact.findMany({ where: { workspaceId, tags: { contains: tv } }, select: SELECT, take: 80 })
  }
  return []
}

async function deliver(workspaceId: string, automationId: string, trigger: string, contact: Cand, template: string): Promise<boolean> {
  // Guardas: no molestar a quien pidió no escribir / IA apagada / descartado.
  try {
    const cf = JSON.parse(contact.customFields || '{}') as Record<string, unknown>
    let tags: string[] = []
    try { tags = JSON.parse(contact.tags || '[]') } catch { /* */ }
    if (cf.aiDisabled || tags.some((t) => String(t).startsWith('noqualify')) || tags.includes('descartado')) return false
  } catch { /* */ }
  if (!contact.phone) return false

  // Solo leads con conversación (reactivación real) → permite anti-duplicado.
  const convo = await db.conversation.findFirst({
    where: { workspaceId, contactId: contact.id }, orderBy: { lastMessageAt: 'desc' }, select: { id: true },
  })
  if (!convo) return false

  // Anti-spam: si ya hubo un saliente en 48h, no enviar.
  const recent = await db.message.findFirst({
    where: { conversationId: convo.id, direction: 'outbound', createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) } },
    select: { id: true },
  })
  if (recent) return false
  // No re-disparar ESTA automatización al mismo lead en 7 días.
  const already = await db.message.findFirst({
    where: { conversationId: convo.id, direction: 'outbound', metadata: { contains: `"automationId":"${automationId}"` }, createdAt: { gte: new Date(Date.now() - REPEAT_MS) } },
    select: { id: true },
  })
  if (already) return false

  const msg = template
    .replace(/\{\{\s*(name|nombre|firstName)\s*\}\}/gi, contact.firstName || 'hola')
    .replace(/\{\{\s*(lastName|apellido)\s*\}\}/gi, contact.lastName || '')
    // También acepta el formato con corchetes [Nombre] / [nombre].
    .replace(/\[\s*(nombre|name)\s*\]/gi, contact.firstName || 'hola')
    .replace(/\[\s*(apellido|lastName)\s*\]/gi, contact.lastName || '')
    .trim()
  if (!msg) return false

  // Fuera de 24h en Meta, usa la plantilla de la acción (inactividad→reactivación).
  const act = trigger === 'days_inactive' ? 'reactivation' : 'follow_up'
  const r = await sendToLead(workspaceId, contact as ContactLike, msg, { action: act }).catch(() => ({ success: false, channel: undefined as string | undefined }))
  if (!r.success) return false

  await db.message.create({
    data: {
      conversationId: convo.id, content: msg, type: 'text', direction: 'outbound', senderType: 'agent',
      senderId: 'marketing-automation', isAiGenerated: false, status: 'sent',
      metadata: JSON.stringify({ source: 'marketing-automation', automationId, trigger, channel: r.channel, automated: true }),
    },
  }).catch(() => {})
  await db.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date(), lastMessagePreview: msg.slice(0, 100) } }).catch(() => {})
  console.log(`[MktAutomation] sent automation=${automationId} trigger=${trigger} contact=${contact.id} channel=${r.channel}`)
  return true
}

/** Evalúa y ejecuta las automatizaciones de leads no-por-etapa de un workspace. */
export async function runMarketingAutomationScan(workspaceId: string): Promise<{ sent: number }> {
  const autos = await db.marketingAutomation.findMany({
    where: { workspaceId, isActive: true, action: 'send_whatsapp', trigger: { in: ['temperature', 'tag', 'days_inactive'] } },
  })
  if (!autos.length) return { sent: 0 }

  let sent = 0
  for (const a of autos) {
    let cfg: Record<string, unknown> = {}
    try { cfg = JSON.parse(a.actionConfig || '{}') } catch { /* */ }
    const template = String(cfg.message || cfg.messageTemplate || '').trim()
    if (!template) continue

    const contacts = await matchContacts(workspaceId, a.trigger, a.triggerValue)
    let ran = 0
    for (const c of contacts) {
      if (ran >= MAX_PER_AUTOMATION) break
      const ok = await deliver(workspaceId, a.id, a.trigger, c, template)
      if (ok) { sent++; ran++ }
    }
    if (ran > 0) {
      await db.marketingAutomation.update({ where: { id: a.id }, data: { executedCount: { increment: ran }, lastExecuted: new Date() } }).catch(() => {})
    }
  }
  return { sent }
}
