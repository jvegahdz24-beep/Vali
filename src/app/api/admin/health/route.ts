// ═══════════════════════════════════════════════════════════════
// TORRE DE CONTROL (solo superadmin): salud de TODOS los tenants de
// un vistazo — WhatsApp conectado, actividad del bot, rezagos y pagos.
// GET /api/admin/health
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Solo superadmin' }, { status: 403 })
    }

    const now = Date.now()
    const h24 = new Date(now - 24 * 3600000)
    const workspaces = await db.workspace.findMany({
      where: { isActive: true },
      select: { id: true, name: true, plan: true, settings: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const rows = await Promise.all(workspaces.map(async (ws) => {
      let s: Record<string, unknown> = {}
      try { s = JSON.parse(ws.settings || '{}') } catch { /* */ }
      const connectedPhone = (s.connectedPhone as string) || null

      // Estado de WhatsApp REAL (registry en memoria de este proceso)
      let waConnected = false
      try { waConnected = getWhatsAppManager(ws.id).getStatus().connected } catch { /* */ }

      const [inbound24, outbound24, lastInbound, lastOutbound, fuOverdue, subscription] = await Promise.all([
        db.message.count({ where: { direction: 'inbound', createdAt: { gte: h24 }, conversation: { workspaceId: ws.id } } }),
        db.message.count({ where: { direction: 'outbound', createdAt: { gte: h24 }, conversation: { workspaceId: ws.id } } }),
        db.message.findFirst({ where: { direction: 'inbound', conversation: { workspaceId: ws.id } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        db.message.findFirst({ where: { direction: 'outbound', conversation: { workspaceId: ws.id } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        db.followUpTask.count({ where: { workspaceId: ws.id, status: 'pending', scheduledAt: { lte: new Date(now - 30 * 60000) } } }),
        db.subscription.findFirst({ where: { workspaceId: ws.id }, orderBy: { currentPeriodEnd: 'desc' }, select: { status: true, plan: true } }).catch(() => null),
      ])

      // IA global pausada/apagada
      const until = s.aiGlobalPausedUntil ? new Date(String(s.aiGlobalPausedUntil)) : null
      const iaPaused = s.aiGlobalPaused === true || !!(until && until.getTime() > now)

      // Semáforo: rojo = tiene WhatsApp vinculado pero está caído, o el bot
      // lleva >2h sin responder habiendo inbound; ámbar = IA pausada o cola
      // rezagada; verde = todo bien. Sin teléfono vinculado = gris (setup).
      const botStuck = !!(lastInbound && (!lastOutbound || lastOutbound.createdAt < lastInbound.createdAt) &&
        (now - lastInbound.createdAt.getTime()) > 2 * 3600000 && !iaPaused)
      let status: 'ok' | 'warn' | 'down' | 'setup' = 'ok'
      if (!connectedPhone) status = 'setup'
      else if (!waConnected || botStuck) status = 'down'
      else if (iaPaused || fuOverdue > 0) status = 'warn'

      return {
        id: ws.id, name: ws.name, plan: ws.plan,
        status, waConnected, connectedPhone,
        iaPaused, inbound24, outbound24,
        lastInboundAt: lastInbound?.createdAt?.toISOString() || null,
        lastOutboundAt: lastOutbound?.createdAt?.toISOString() || null,
        followupsRezagados: fuOverdue,
        botStuck,
        billing: subscription?.status || null,
      }
    }))

    // Los caídos primero, luego advertencias
    const order = { down: 0, warn: 1, ok: 2, setup: 3 }
    rows.sort((a, b) => order[a.status] - order[b.status])
    return NextResponse.json({ success: true, generatedAt: new Date().toISOString(), tenants: rows })
  } catch (error) {
    console.error('[Admin Health]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
