// ═══════════════════════════════════════════════════════════════
// Agentes IA — Dashboard stats (datos REALES para la vista tipo mockup).
// GET /api/agent-factory/dashboard?workspaceId=
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const now = new Date()
    const startToday = new Date(new Date().setHours(0, 0, 0, 0))
    const startYesterday = new Date(startToday.getTime() - 86400000)
    const convWhere = { conversation: { workspaceId } }
    const wonWhere = { workspaceId, OR: [{ status: 'won' }, { stage: { isWon: true } }] }
    const lostWhere = { workspaceId, OR: [{ status: 'lost' }, { stage: { isLost: true } }] }

    const [
      agents, activeAgents, msgToday, msgYesterday, dealsToday, dealsYesterday,
      wonCount, lostCount, aiMsgTotal, recentEvents,
    ] = await Promise.all([
      db.agentInstance.count({ where: { workspaceId } }),
      db.agentInstance.count({ where: { workspaceId, status: 'activo' } }),
      db.message.count({ where: { ...convWhere, isAiGenerated: true, createdAt: { gte: startToday } } }).catch(() => 0),
      db.message.count({ where: { ...convWhere, isAiGenerated: true, createdAt: { gte: startYesterday, lt: startToday } } }).catch(() => 0),
      db.deal.count({ where: { workspaceId, createdAt: { gte: startToday } } }).catch(() => 0),
      db.deal.count({ where: { workspaceId, createdAt: { gte: startYesterday, lt: startToday } } }).catch(() => 0),
      db.deal.count({ where: wonWhere }).catch(() => 0),
      db.deal.count({ where: lostWhere }).catch(() => 0),
      db.agentInstance.aggregate({ where: { workspaceId }, _sum: { totalMessagesSent: true } }),
      db.engineEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, type: true, createdAt: true } }).catch(() => []),
    ])

    // Conversaciones IA por día (últimos 7 días) — reales
    const perDay: { d: string; label: string; n: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(startToday.getTime() - i * 86400000)
      const next = new Date(day.getTime() + 86400000)
      const n = await db.message.count({ where: { ...convWhere, isAiGenerated: true, createdAt: { gte: day, lt: next } } }).catch(() => 0)
      perDay.push({ d: day.toISOString().slice(0, 10), label: `${day.getDate()}/${day.getMonth() + 1}`, n })
    }

    // Distribución por rol/vertical — real
    const byRole = await db.agentInstance.groupBy({ by: ['role'], where: { workspaceId }, _count: { role: true } }).catch(() => [] as { role: string; _count: { role: number } }[])

    // Top agentes por mensajes enviados — real
    const topAgents = await db.agentInstance.findMany({ where: { workspaceId }, orderBy: { totalMessagesSent: 'desc' }, take: 5, select: { name: true, totalMessagesSent: true, vertical: true } })

    const conversionRate = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0))

    return NextResponse.json({
      kpis: {
        activeAgents, totalAgents: agents,
        msgToday, msgTodayDelta: pct(msgToday, msgYesterday),
        dealsToday, dealsTodayDelta: pct(dealsToday, dealsYesterday),
        conversionRate,
        aiMessagesTotal: aiMsgTotal._sum.totalMessagesSent || 0,
      },
      perDay,
      byRole: byRole.map((r) => ({ role: r.role, count: r._count.role })),
      topAgents,
      recentEvents,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
