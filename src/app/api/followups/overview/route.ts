// ═══════════════════════════════════════════════════════════════
// Monitoreo de seguimientos automáticos (pedido de Jhon 2026-07-14:
// "no hay manera de monitorearlos, siempre aparece seguimientos cero").
// GET /api/followups/overview?workspaceId= →
//   contadores (programados, en cola, enviados hoy/7d, cancelados 7d)
//   + próximos programados + últimos enviados, con nombre del contacto.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const now = new Date()
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
    const d7 = new Date(now.getTime() - 7 * 86400000)

    const [programados, enCola, esperandoAprobacion, enviadosHoy, enviados7d, cancelados7d, proximos, recientes] = await Promise.all([
      db.followUpTask.count({ where: { workspaceId, status: 'pending' } }),
      // vencidos esperando al worker (corre cada ~10 min)
      db.followUpTask.count({ where: { workspaceId, status: 'pending', scheduledAt: { lte: now } } }),
      // borradores esperando el ✅ por Telegram (modo aprobación; auto-envío a las 3h)
      db.followUpTask.count({ where: { workspaceId, status: 'awaiting_approval' } }),
      db.followUpTask.count({ where: { workspaceId, status: 'sent', sentAt: { gte: dayStart } } }),
      db.followUpTask.count({ where: { workspaceId, status: 'sent', sentAt: { gte: d7 } } }),
      db.followUpTask.count({ where: { workspaceId, status: 'cancelled', createdAt: { gte: d7 } } }),
      db.followUpTask.findMany({
        where: { workspaceId, status: 'pending' },
        orderBy: { scheduledAt: 'asc' }, take: 8,
      }),
      db.followUpTask.findMany({
        where: { workspaceId, status: 'sent' },
        orderBy: { sentAt: 'desc' }, take: 6,
      }),
    ])

    // FollowUpTask no tiene relación con Contact en el schema — se cargan aparte.
    const contactIds = [...new Set([...proximos, ...recientes].map((t) => t.contactId).filter(Boolean))] as string[]
    const contactRows = contactIds.length
      ? await db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true, temperature: true } })
      : []
    const cmap = new Map(contactRows.map((c) => [c.id, c]))

    const row = (t: { id: string; contactId: string | null; scheduledAt: Date; sentAt: Date | null; metadata: string | null; ruleId: string }) => {
      let tipo = ''
      try { tipo = JSON.parse(t.metadata || '{}').tipo || '' } catch { /* */ }
      const c = t.contactId ? cmap.get(t.contactId) : undefined
      return {
        id: t.id,
        contactId: c?.id || null,
        contacto: c ? `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}` : 'Contacto',
        temperatura: c?.temperature || 'cold',
        cuando: (t.sentAt || t.scheduledAt).toISOString(),
        tipo: tipo === 'reactivacion_fria' ? 'frío' : t.ruleId === 'manual-broadcast' ? 'masivo' : 'seguimiento',
      }
    }

    return Response.json({
      success: true,
      stats: { programados, enCola, esperandoAprobacion, enviadosHoy, enviados7d, cancelados7d },
      proximos: proximos.map(row),
      recientes: recientes.map(row),
    })
  } catch (error) { return errorResponse(error) }
}
