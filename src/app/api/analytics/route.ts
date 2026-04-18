// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Analytics API
// GET /api/analytics — Analytics data for charts
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const period = searchParams.get('period') || '7d'

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    switch (period) {
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      default:
        startDate.setDate(now.getDate() - 7)
    }

    // ─── Messages Over Time ─────────────────────────────────
    const messagesByDay = await db.message.groupBy({
      by: ['createdAt'],
      where: {
        conversation: { workspaceId: workspaceId! },
        createdAt: { gte: startDate },
      },
      _count: { id: true },
    })

    // Group by day
    const messageMap = new Map<string, number>()
    for (const item of messagesByDay) {
      const day = item.createdAt.toISOString().split('T')[0]
      messageMap.set(day, (messageMap.get(day) || 0) + ((item._count as any)?.id || 0))
    }

    const messagesOverTime = buildDateSeries(startDate, now, (dateStr) => ({
      date: dateStr,
      value: messageMap.get(dateStr) || 0,
    }))

    // ─── Deals by Stage ─────────────────────────────────────
    const dealsByStage = await db.deal.groupBy({
      by: ['stageId'],
      where: { workspaceId: workspaceId!, status: 'active' },
      _count: { id: true },
      _sum: { value: true },
    })

    const stageInfo = await db.pipelineStage.findMany({
      where: { pipeline: { workspaceId: workspaceId! } },
      select: { id: true, name: true, color: true },
    })

    const dealsByStageData = dealsByStage.map((d) => {
      const stage = stageInfo.find((s) => s.id === d.stageId)
      return {
        stage: stage?.name || 'Unknown',
        color: stage?.color || '#6366f1',
        count: ((d._count as any)?.id || 0) as number,
        value: (d._sum?.value || 0) as number,
      }
    })

    // ─── Conversion Funnel ──────────────────────────────────
    const totalLeads = await db.contact.count({ where: { workspaceId: workspaceId!, createdAt: { gte: startDate } } })
    const contacted = await db.conversation.count({ where: { workspaceId: workspaceId!, createdAt: { gte: startDate } } })

    // Get pipeline stages to map funnel steps to stage probabilities
    const funnelStages = await db.pipelineStage.findMany({
      where: { pipeline: { workspaceId: workspaceId! } },
      select: { id: true, name: true, probability: true, isWon: true, isLost: true },
    })

    // Qualified: deals in stages with probability >= 30 (Cualificado and above)
    const qualifiedStageIds = funnelStages.filter(s => s.probability >= 30 && !s.isWon && !s.isLost).map(s => s.id)
    const qualified = qualifiedStageIds.length > 0
      ? await db.deal.count({ where: { workspaceId: workspaceId!, createdAt: { gte: startDate }, stageId: { in: qualifiedStageIds }, status: 'active' } })
      : 0

    // Proposals: deals in stages with probability >= 60 (Propuesta and above, excluding won/lost)
    const proposalStageIds = funnelStages.filter(s => s.probability >= 60 && !s.isWon && !s.isLost).map(s => s.id)
    const proposals = proposalStageIds.length > 0
      ? await db.deal.count({ where: { workspaceId: workspaceId!, createdAt: { gte: startDate }, stageId: { in: proposalStageIds }, status: 'active' } })
      : 0

    // Negotiating: deals in stages with probability >= 70 and not won/lost
    const negotiatingStageIds = funnelStages.filter(s => s.probability >= 70 && !s.isWon && !s.isLost).map(s => s.id)
    const negotiating = negotiatingStageIds.length > 0
      ? await db.deal.count({ where: { workspaceId: workspaceId!, createdAt: { gte: startDate }, stageId: { in: negotiatingStageIds }, status: 'active' } })
      : 0

    const won = await db.deal.count({ where: { workspaceId: workspaceId!, createdAt: { gte: startDate }, status: 'won' } })

    const conversionFunnel = [
      { stage: 'Leads', count: totalLeads },
      { stage: 'Contactados', count: contacted },
      { stage: 'Cualificados', count: qualified },
      { stage: 'Propuesta', count: proposals },
      { stage: 'Negociación', count: negotiating },
      { stage: 'Cerrados', count: won },
    ]

    // ─── Top Agents (by message count) ──────────────────────
    const topAgents = (await db.agent.findMany({
      where: { workspaceId: workspaceId!, isActive: true },
      include: {
        _count: {
          select: { logs: true },
        },
      },
      orderBy: {
        logs: { _count: 'desc' },
      },
      take: 5,
    })) as Array<any>

    const topAgentsData = topAgents.map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      messageCount: a._count?.logs || 0,
    }))

    // ─── Channel Distribution ───────────────────────────────
    const channelDistribution = await db.conversation.groupBy({
      by: ['channel'],
      where: { workspaceId: workspaceId!, createdAt: { gte: startDate } },
      _count: { id: true },
    })

    const channelData = channelDistribution.map((c) => ({
      channel: c.channel,
      count: ((c._count as any)?.id || 0) as number,
    }))

    // ─── AI Performance ─────────────────────────────────────
    const [totalAiMessages, avgConfidenceResult] = await Promise.all([
      db.message.count({
        where: {
          conversation: { workspaceId: workspaceId! },
          isAiGenerated: true,
          createdAt: { gte: startDate },
        },
      }),
      db.agentLog.aggregate({
        where: {
          conversation: { workspaceId: workspaceId! },
          createdAt: { gte: startDate },
        },
        _avg: { confidence: true },
      }),
    ])

    // ─── Summary Stats ──────────────────────────────────────
    const summary = {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      totalMessages: messagesByDay.reduce((sum, item) => sum + ((item._count as any)?.id || 0), 0),
      aiMessages: totalAiMessages,
      avgConfidence: Math.round(((avgConfidenceResult._avg as any)?.confidence || 0) * 100) / 100,
      totalLeads: totalLeads,
      dealsWon: won,
      conversionRate: contacted > 0 ? Math.round((won / contacted) * 100) : 0,
    }

    return Response.json({
      summary,
      messagesOverTime,
      dealsByStage: dealsByStageData,
      conversionFunnel,
      topAgents: topAgentsData,
      channelDistribution: channelData,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// Helper: build date series from start to end
function buildDateSeries(
  start: Date,
  end: Date,
  mapper: (dateStr: string) => { date: string; value: number }
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = []
  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]
    result.push(mapper(dateStr))
    current.setDate(current.getDate() + 1)
  }
  return result
}
