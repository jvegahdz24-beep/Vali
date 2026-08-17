// ═══════════════════════════════════════════════════════════════
// Automatizaciones — KPIs + estadísticas de ejecución (datos reales).
// GET /api/automations/stats?workspaceId=
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
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [total, active, runsAgg, lastRun, byStatusAll, runsMonth] = await Promise.all([
      db.automation.count({ where: { workspaceId } }),
      db.automation.count({ where: { workspaceId, isActive: true } }),
      db.automation.aggregate({ where: { workspaceId }, _sum: { runCount: true } }),
      db.automation.findFirst({ where: { workspaceId, lastRunAt: { not: null } }, orderBy: { lastRunAt: 'desc' }, select: { lastRunAt: true } }),
      db.automationLog.groupBy({ by: ['status'], where: { workspaceId }, _count: { status: true } }).catch(() => [] as { status: string; _count: { status: number } }[]),
      db.automationLog.count({ where: { workspaceId, createdAt: { gte: monthStart } } }).catch(() => 0),
    ])

    const byStatus: Record<string, number> = { success: 0, failed: 0, skipped: 0, partial: 0 }
    let logged = 0
    for (const r of byStatusAll) {
      const s = r.status === 'error' ? 'failed' : (r.status in byStatus ? r.status : 'skipped')
      byStatus[s] = (byStatus[s] || 0) + r._count.status
      logged += r._count.status
    }
    const successRate = logged > 0 ? Math.round((byStatus.success / logged) * 1000) / 10 : 0

    return NextResponse.json({
      total,
      active,
      paused: total - active,
      totalRuns: runsAgg._sum.runCount || 0,
      runsMonth,
      logged,
      successRate,
      byStatus,
      lastRunAt: lastRun?.lastRunAt || null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
