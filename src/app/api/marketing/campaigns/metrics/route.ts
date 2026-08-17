// ═══════════════════════════════════════════════════════════════
// Métricas POR CAMPAÑA de envíos masivos (contrato A.2.7 §Pantalla 5).
// GET /api/marketing/campaigns/metrics?workspaceId=xxx
// Agrupa los FollowUpTask de difusión (ruleId='manual-broadcast') por campaignId
// (guardado en metadata) y calcula entrega + respuestas por campaña.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

interface Grp {
  campaignId: string; name: string; channel: string; firstAt: Date
  total: number; sent: number; pending: number; failed: number; cancelled: number
  convoIds: Set<string>
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const tasks = await db.followUpTask.findMany({
      where: { workspaceId, ruleId: 'manual-broadcast' },
      select: { status: true, scheduledAt: true, conversationId: true, metadata: true },
      orderBy: { scheduledAt: 'desc' },
      take: 1500,
    })

    const map = new Map<string, Grp>()
    for (const t of tasks) {
      let m: Record<string, unknown> = {}
      try { m = JSON.parse(t.metadata || '{}') } catch { /* */ }
      const cid = (m.campaignId as string) || 'legacy'
      let g = map.get(cid)
      if (!g) {
        g = { campaignId: cid, name: (m.campaignName as string) || 'Difusión', channel: (m.channel as string) || 'auto', firstAt: t.scheduledAt, total: 0, sent: 0, pending: 0, failed: 0, cancelled: 0, convoIds: new Set() }
        map.set(cid, g)
      }
      g.total++
      if (t.status === 'sent') g.sent++
      else if (t.status === 'pending') g.pending++
      else if (t.status === 'failed') g.failed++
      else if (t.status === 'cancelled') g.cancelled++
      if (t.conversationId) g.convoIds.add(t.conversationId)
      if (t.scheduledAt < g.firstAt) g.firstAt = t.scheduledAt
    }

    // Ordena por fecha (más recientes primero) y limita a 30 campañas.
    const groups = [...map.values()].sort((a, b) => b.firstAt.getTime() - a.firstAt.getTime()).slice(0, 30)

    const campaigns: Array<{ campaignId: string; name: string; channel: string; date: Date; total: number; sent: number; pending: number; failed: number; cancelled: number; responses: number; responseRate: number }> = []
    for (const g of groups) {
      // Respuestas = conversaciones de la campaña con un mensaje ENTRANTE después
      // del arranque de la campaña.
      let responses = 0
      if (g.convoIds.size) {
        const responded = await db.message.findMany({
          where: { conversationId: { in: [...g.convoIds] }, direction: 'inbound', createdAt: { gte: g.firstAt } },
          select: { conversationId: true }, distinct: ['conversationId'],
        })
        responses = responded.length
      }
      campaigns.push({
        campaignId: g.campaignId, name: g.name, channel: g.channel, date: g.firstAt,
        total: g.total, sent: g.sent, pending: g.pending, failed: g.failed, cancelled: g.cancelled,
        responses, responseRate: g.sent > 0 ? Math.round((responses / g.sent) * 100) : 0,
      })
    }

    return Response.json({ campaigns })
  } catch (error) { return errorResponse(error) }
}
