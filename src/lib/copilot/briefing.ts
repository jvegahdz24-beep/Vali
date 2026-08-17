// ═══════════════════════════════════════════════════════════════
// Briefing ejecutivo del día — compartido por el tool del Copiloto y
// el cron diario (Telegram/WhatsApp automático cada mañana).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'

export interface BriefingData {
  newContacts: number
  messages: number
  wonToday: number
  hotLeads: { name: string; score: number }[]
  appointments: { when: Date; title: string; contact?: string }[]
  agentsActive: number
  automationsActive: number
  whatsappConnected: boolean
  whatsappPhone?: string | null
}

export async function collectBriefing(workspaceId: string): Promise<BriefingData> {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const tomorrow = new Date(dayStart.getTime() + 2 * 86400000)
  const [newC, msgs, won, hotList, appts, agents, autos] = await Promise.all([
    db.contact.count({ where: { workspaceId, createdAt: { gte: dayStart } } }),
    db.message.count({ where: { conversation: { workspaceId }, createdAt: { gte: dayStart } } }).catch(() => 0),
    db.deal.count({ where: { workspaceId, status: 'won', wonAt: { gte: dayStart } } }),
    db.contact.findMany({ where: { workspaceId, status: 'active', OR: [{ temperature: 'hot' }, { leadScore: { gte: 70 } }] }, orderBy: { leadScore: 'desc' }, take: 5, select: { firstName: true, lastName: true, leadScore: true } }),
    db.appointment.findMany({ where: { workspaceId, status: 'pending', date: { gte: dayStart, lte: tomorrow } }, orderBy: { date: 'asc' }, take: 8, include: { contact: { select: { firstName: true, lastName: true } } } }),
    db.agentInstance.count({ where: { workspaceId, status: 'activo' } }),
    db.automation.count({ where: { workspaceId, isActive: true } }),
  ])
  const st = getWhatsAppManager(workspaceId).getStatus()
  return {
    newContacts: newC, messages: msgs, wonToday: won,
    hotLeads: hotList.map((h) => ({ name: `${h.firstName}${h.lastName ? ' ' + h.lastName : ''}`, score: h.leadScore })),
    appointments: appts.map((ap) => ({ when: ap.date, title: ap.title, contact: ap.contact ? `${ap.contact.firstName}${ap.contact.lastName ? ' ' + ap.contact.lastName : ''}` : undefined })),
    agentsActive: agents, automationsActive: autos,
    whatsappConnected: st.connected, whatsappPhone: st.phone,
  }
}

/** Texto del briefing (plano; `html` activa negritas de Telegram). */
export function formatBriefing(d: BriefingData, opts?: { html?: boolean; timezone?: string }): string {
  const b = (s: string) => (opts?.html ? `<b>${s}</b>` : s)
  const tz = opts?.timezone
  const fmtWhen = (w: Date) => new Date(w).toLocaleString('es-MX', { weekday: 'short', hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) })
  const hotTxt = d.hotLeads.length ? d.hotLeads.map((h) => `${h.name} (${h.score})`).join(', ') : 'ninguno'
  const apptTxt = d.appointments.length ? d.appointments.map((a) => `${fmtWhen(a.when)} ${a.title}${a.contact ? ` con ${a.contact}` : ''}`).join('; ') : 'sin citas'
  return (
    `☀️ ${b('Briefing de hoy')}\n` +
    `• Actividad: ${d.newContacts} contacto(s) nuevo(s), ${d.messages} mensaje(s), ${d.wonToday} venta(s) cerrada(s) hoy.\n` +
    `• 🔥 Leads calientes por atender: ${hotTxt}.\n` +
    `• 📅 Citas (hoy/mañana): ${apptTxt}.\n` +
    `• Sistema: WhatsApp ${d.whatsappConnected ? '🟢 conectado' : '🔴 DESCONECTADO'}, ${d.agentsActive} agente(s) IA activo(s), ${d.automationsActive} automatización(es) activa(s).` +
    (d.whatsappConnected ? '' : '\n⚠️ PRIORIDAD: reconectar WhatsApp.')
  )
}
