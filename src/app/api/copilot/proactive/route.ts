// ═══════════════════════════════════════════════════════════════
// GET /api/copilot/proactive?workspaceId= — mensaje proactivo del copiloto:
// saludo + alertas accionables del negocio (rápido, data-driven).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const ws = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(ws, session.userId)

    const soon = new Date(Date.now() + 2 * 86400000)
    const [hot, unread, appts, items] = await Promise.all([
      db.contact.count({ where: { workspaceId: ws, OR: [{ temperature: 'hot' }, { leadScore: { gte: 70 } }] } }).catch(() => 0),
      db.conversation.count({ where: { workspaceId: ws, unreadCount: { gt: 0 } } }).catch(() => 0),
      db.appointment.count({ where: { workspaceId: ws, status: 'pending', date: { gte: new Date(), lte: soon } } }).catch(() => 0),
      db.catalogItem.findMany({ where: { workspaceId: ws }, select: { imageUrl: true, metadata: true } }).catch(() => []),
    ])
    let noPhoto = 0
    for (const it of items) { if (it.imageUrl) continue; try { const m = JSON.parse(it.metadata || '{}'); if (!(Array.isArray(m.images) && m.images.length)) noPhoto++ } catch { noPhoto++ } }

    const alerts: string[] = []
    if (unread > 0) alerts.push(`tienes ${unread} conversación(es) sin leer`)
    if (hot > 0) alerts.push(`${hot} lead(s) caliente(s) para dar seguimiento`)
    if (appts > 0) alerts.push(`${appts} cita(s) en las próximas 48h`)
    if (noPhoto > 0) alerts.push(`${noPhoto} auto(s) sin foto (mejóralos para vender más)`)

    const name = (session.name || '').split(' ')[0]
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }).format(new Date())) % 24
    const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
    const message = alerts.length
      ? `${saludo}${name ? ', ' + name : ''} 👋 Esto es lo que veo hoy: ${alerts.join('; ')}. ¿Quieres que te ayude con algo de esto?`
      : `${saludo}${name ? ', ' + name : ''} 👋 Todo en orden por ahora. ¿En qué te ayudo? Puedo crear contenido, publicar, analizar tu inventario o darte un reporte.`

    return Response.json({ message, hasAlerts: alerts.length > 0, count: alerts.length })
  } catch (error) { return errorResponse(error) }
}
