// ═══════════════════════════════════════════════════════════════
// Pulso del negocio: fotografía VIVA de toda la plataforma que se
// inyecta en el system prompt del Copiloto en cada turno. Es lo que
// lo convierte en cerebro central: arranca sabiendo el estado real de
// CRM, conversaciones, pipeline, inventario, citas, aprobaciones,
// agentes, automatizaciones y la IA de WhatsApp — sin pedirlo.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')

export async function buildPulse(workspaceId: string): Promise<string> {
  try {
    const now = new Date()
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const h48 = new Date(now.getTime() - 48 * 3600000)

    const [
      wsRow, contactsTotal, hotLeads, convs48, openDeals, wonMonth,
      apptsToday, invTotal, invActive, apprPending, agentsOn,
      autosOn, lessons, unreadConvs,
    ] = await Promise.all([
      db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } }),
      db.contact.count({ where: { workspaceId } }),
      db.contact.count({ where: { workspaceId, temperature: 'hot' } }),
      db.conversation.count({ where: { workspaceId, lastMessageAt: { gte: h48 } } }),
      db.deal.aggregate({ where: { workspaceId, status: 'active' }, _count: true, _sum: { value: true } }),
      db.deal.aggregate({ where: { workspaceId, status: 'won', wonAt: { gte: monthStart } }, _count: true, _sum: { value: true } }),
      db.appointment.findMany({
        where: { workspaceId, status: 'pending', date: { gte: dayStart, lt: dayEnd }, type: { not: 'blocked' } },
        orderBy: { date: 'asc' }, take: 5,
        include: { contact: { select: { firstName: true, lastName: true } } },
      }),
      db.catalogItem.count({ where: { workspaceId } }),
      db.catalogItem.count({ where: { workspaceId, isActive: true } }),
      db.pendingApproval.findMany({ where: { workspaceId, status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 3 }),
      db.agentInstance.count({ where: { workspaceId, status: 'activo' } }).catch(() => 0),
      db.automation.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
      db.aiTrainingExample.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
      db.conversation.count({ where: { workspaceId, unreadCount: { gt: 0 } } }).catch(() => 0),
    ])

    // Estado de la IA de WhatsApp (switch global del tablero)
    let iaLine = 'activa'
    try {
      const s = JSON.parse(wsRow?.settings || '{}')
      const until = s.aiGlobalPausedUntil ? new Date(String(s.aiGlobalPausedUntil)) : null
      const untilActive = !!(until && !isNaN(until.getTime()) && until.getTime() > Date.now())
      if (s.aiGlobalPaused === true && !untilActive) iaLine = '🔴 APAGADA (indefinido) — el bot NO responde a nadie'
      else if (untilActive) iaLine = `⏸️ PAUSADA hasta las ${until!.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    } catch { /* activa */ }

    let waLine = 'desconocido'
    try {
      const st = getWhatsAppManager(workspaceId).getStatus()
      waLine = st.connected ? `🟢 conectado (${st.phone || 's/n'})` : '🔴 DESCONECTADO'
    } catch { /* desconocido */ }

    const apptLines = apptsToday.map((ap) => {
      const t = new Date(ap.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      const who = ap.contact ? ` con ${ap.contact.firstName}${ap.contact.lastName ? ' ' + ap.contact.lastName : ''}` : ''
      return `${t} ${ap.title}${who}`
    }).join(' · ')

    const apprLines = apprPending.length
      ? apprPending.map((a) => `"${a.summary}"`).join(' · ')
      : 'ninguna'

    return `\n\nPULSO DEL NEGOCIO AHORA (datos reales de la plataforma en este instante — cítalos con confianza; para detalle o acciones usa las herramientas):
- WhatsApp: ${waLine} · IA del bot: ${iaLine}
- CRM: ${contactsTotal} contactos (${hotLeads} calientes 🔥) · ${convs48} conversaciones activas 48h${unreadConvs ? ` · ${unreadConvs} sin leer` : ''}
- Pipeline: ${openDeals._count} tratos abiertos por ${money(openDeals._sum.value || 0)} · Ganados este mes: ${wonMonth._count} (${money(wonMonth._sum.value || 0)})
- Citas HOY: ${apptsToday.length ? apptLines : 'ninguna'}
- Inventario: ${invActive} autos disponibles de ${invTotal}
- Aprobaciones pendientes: ${apprPending.length} — ${apprLines}
- Agentes IA activos: ${agentsOn} · Automatizaciones activas: ${autosOn} · Lecciones del bot: ${lessons}`
  } catch {
    return ''
  }
}
