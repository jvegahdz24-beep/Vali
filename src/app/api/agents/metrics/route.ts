// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Agent Metrics API
// GET /api/agents/metrics — Per-agent performance metrics
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

    // Fetch all agents in workspace (including inactive)
    const agents = await db.agent.findMany({
      where: { workspaceId: workspaceId! },
      select: { id: true, name: true, type: true, isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    // Build metrics for each agent
    const metrics: Array<{
      agentId: string
      agentName: string
      agentType: string
      isActive: boolean
      conversationsHandled: number
      messagesSent: number
      messagesTotal: number
      avgResponseTimeMs: number
      successRate: number | null
      hasRealData: boolean
      leadsQualified: number
      dealsClosed: number
      lastActivity: string | null
      messagesLast7Days: number[]
    }> = []

    for (const agent of agents) {
      // Count conversations assigned to this agent
      const conversationsCount = await db.conversation.count({
        where: {
          workspaceId: workspaceId!,
          assignedAgentId: agent.id,
        },
      })

      // Count messages sent by this agent (outbound)
      const messagesSent = await db.message.count({
        where: {
          agentId: agent.id,
          direction: 'outbound',
        },
      })

      // Count total messages handled (inbound + outbound)
      const messagesTotal = await db.message.count({
        where: {
          agentId: agent.id,
        },
      })

      // Count agent logs (for total interactions)
      const agentLogs = await db.agentLog.findMany({
        where: { agentId: agent.id },
        select: {
          createdAt: true,
          latencyMs: true,
          confidence: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      })

      // Calculate avg response time from agent logs
      const responseTimes = agentLogs
        .map((log) => log.latencyMs)
        .filter((t) => t > 0)
      const avgResponseTime =
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0

      // Calculate success rate (confidence > 0.7)
      // Return null when no real interactions exist to avoid misleading 0%
      const hasRealData = agentLogs.length > 0 || messagesTotal > 0
      const confidenceScores = agentLogs
        .map((log) => log.confidence)
        .filter((c) => c > 0)
      const successCount = confidenceScores.filter((c) => c >= 0.7).length
      const successRate = hasRealData
        ? (confidenceScores.length > 0
            ? Math.round((successCount / confidenceScores.length) * 100)
            : 0)
        : null

      // Last activity from agent logs
      const lastActivity = agentLogs.length > 0 ? agentLogs[0].createdAt : null

      // Count leads qualified (conversations that progressed to a later stage)
      // Simplified: count conversations with agent where status is not active/pending
      const leadsQualified = await db.conversation.count({
        where: {
          workspaceId: workspaceId!,
          assignedAgentId: agent.id,
          status: { in: ['closed', 'bot'] },
        },
      })

      // Count leads closed (deals won assigned through conversations)
      const dealsClosed = await db.deal.count({
        where: {
          workspaceId: workspaceId!,
          closedBy: agent.id,
          status: 'won',
        },
      })

      // Messages over last 7 days for sparkline
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const dailyMessages = await db.message.groupBy({
        by: ['createdAt'],
        where: {
          agentId: agent.id,
          direction: 'outbound',
          createdAt: { gte: sevenDaysAgo },
        },
        _count: { id: true },
      })

      // Group by day
      const messagesByDay: Record<string, number> = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const key = d.toISOString().split('T')[0]
        messagesByDay[key] = 0
      }
      for (const msg of dailyMessages) {
        const key = new Date(msg.createdAt).toISOString().split('T')[0]
        if (key in messagesByDay) {
          messagesByDay[key] += msg._count.id
        }
      }

      metrics.push({
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.type,
        isActive: agent.isActive,
        conversationsHandled: conversationsCount,
        messagesSent,
        messagesTotal,
        avgResponseTimeMs: avgResponseTime,
        successRate,
        hasRealData,
        leadsQualified,
        dealsClosed,
        lastActivity: lastActivity?.toISOString() || null,
        messagesLast7Days: Object.values(messagesByDay),
      })
    }

    return Response.json({ metrics })
  } catch (error) {
    return errorResponse(error)
  }
}
