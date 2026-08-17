// ═══════════════════════════════════════════════════════════════
// Evaluador de reglas de seguimiento por INACTIVIDAD (FollowUpRule).
// Para cada regla activa, busca contactos inactivos > N días y agenda un
// FollowUpTask (que el worker envía). FRENOS de seguridad:
//   - solo contactos NO aiDisabled (cerrados/silenciados/noqualify quedan fuera)
//   - salta si tiene cita pendiente
//   - cooldown: nada si ya hubo un follow-up dentro de cooldownHours
//   - tope global por corrida (no más de MAX_PER_RUN)
//   - dryRun: NO crea tareas (solo devuelve a quién dispararía) → preview seguro
// El cron solo lo invoca si el workspace activó settings.autoReactivation (opt-in).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

const MAX_PER_RUN = 20

export interface InactivityHit {
  ruleId: string
  ruleName: string
  contactId: string
  contactName: string
  phone: string | null
  daysInactive: number
  message: string
}

export async function evaluateInactivityRules(
  workspaceId: string,
  opts?: { dryRun?: boolean },
): Promise<InactivityHit[]> {
  const dryRun = opts?.dryRun === true
  const hits: InactivityHit[] = []

  const rules = await db.followUpRule.findMany({
    where: { workspaceId, triggerType: 'inactivity', isActive: true },
    orderBy: { priority: 'desc' },
  })
  if (rules.length === 0) return hits

  const now = Date.now()
  const seen = new Set<string>() // un solo follow-up por contacto por corrida

  for (const rule of rules) {
    if (hits.length >= MAX_PER_RUN) break
    let days = 7
    try { days = JSON.parse(rule.triggerConfig || '{}').days || 7 } catch { /* default */ }
    const cutoff = new Date(now - days * 86400000)
    const cooldownMs = (rule.cooldownHours || 48) * 3600000

    const contacts = await db.contact.findMany({
      where: {
        workspaceId,
        lastMessageAt: { lt: cutoff, not: null },
        status: { notIn: ['closed', 'lost', 'disqualified', 'won'] },
      },
      orderBy: { lastMessageAt: 'asc' },
      take: 80,
      select: { id: true, firstName: true, lastName: true, phone: true, customFields: true, lastMessageAt: true },
    })

    for (const c of contacts) {
      if (hits.length >= MAX_PER_RUN) break
      if (seen.has(c.id) || !c.phone) continue

      // Freno 1: aiDisabled (cerrado / noqualify / modo manual)
      try { if (JSON.parse(c.customFields || '{}').aiDisabled === true) continue } catch { /* ok */ }

      // Freno 2: cita pendiente futura
      const appt = await db.appointment.findFirst({ where: { contactId: c.id, status: 'pending', date: { gte: new Date() } }, select: { id: true } })
      if (appt) continue

      // Freno 3: cooldown — ya hubo un follow-up reciente
      const recent = await db.followUpTask.findFirst({
        where: { contactId: c.id, createdAt: { gte: new Date(now - cooldownMs) } },
        select: { id: true },
      })
      if (recent) continue

      // Conversación activa (la tarea la necesita)
      const convo = await db.conversation.findFirst({ where: { workspaceId, contactId: c.id }, orderBy: { lastMessageAt: 'desc' }, select: { id: true } })
      if (!convo) continue

      seen.add(c.id)
      const daysInactive = Math.floor((now - new Date(c.lastMessageAt!).getTime()) / 86400000)
      const name = `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`.trim()
      // Plantilla VACÍA = la IA redacta un mensaje PERSONALIZADO según la
      // conversación real del lead (tipo 'reactivacion_emocional'); el
      // cron/worker lo generan al enviar vía generateFollowUpMessage.
      const hasTemplate = (rule.messageTemplate || '').trim().length > 0
      const message = hasTemplate
        ? rule.messageTemplate.replace(/\{\{name\}\}/g, c.firstName).replace(/\{\{firstName\}\}/g, c.firstName)
        : '(la IA redactará un mensaje personalizado según la conversación)'

      if (!dryRun) {
        await db.followUpTask.create({
          data: {
            workspaceId, ruleId: rule.id, contactId: c.id, conversationId: convo.id,
            status: 'pending', scheduledAt: new Date(),
            ...(hasTemplate ? {} : { metadata: JSON.stringify({ tipo: 'reactivacion_emocional' }) }),
          },
        })
      }
      hits.push({ ruleId: rule.id, ruleName: rule.name, contactId: c.id, contactName: name, phone: c.phone, daysInactive, message })
    }
  }

  return hits
}
