// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Analytics Realtime API
// GET /api/analytics/realtime — Live metrics aggregated from DB
// Polled every 30s by frontend; no caching so numbers are always fresh.
//
// Query params:
//   workspaceId  (required)
//   agentId      (optional) — filter by specific agent
//   channel      (optional) — filter by channel (whatsapp, webchat, etc.)
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

    // Optional filters
    const agentId = searchParams.get('agentId') || undefined
    const channel = searchParams.get('channel') || undefined

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // ─── Base filters ─────────────────────────────────────────

    const convWhere = {
      workspaceId: workspaceId!,
      ...(channel ? { channel } : {}),
    }

    const msgWhere = {
      conversation: {
        workspaceId: workspaceId!,
        ...(channel ? { channel } : {}),
        ...(agentId ? { assignedAgentId: agentId } : {}),
      },
    }

    // ─── Parallel aggregations ─────────────────────────────────

    const [
      totalContacts,
      newContactsToday,
      activeConversations,
      messagesToday,
      aiMessagesToday,
      openDeals,
      dealsWonThisMonth,
      pipelineValue,
      avgResponseMs,
    ] = await Promise.all([
      db.contact.count({ where: { workspaceId: workspaceId! } }),

      db.contact.count({
        where: { workspaceId: workspaceId!, createdAt: { gte: todayStart } },
      }),

      db.conversation.count({
        where: { ...convWhere, status: 'active' },
      }),

      db.message.count({
        where: { ...msgWhere, createdAt: { gte: todayStart } },
      }),

      db.message.count({
        where: { ...msgWhere, isAiGenerated: true, createdAt: { gte: todayStart } },
      }),

      db.deal.count({
        where: { workspaceId: workspaceId!, status: 'active' },
      }),

      db.deal.count({
        where: {
          workspaceId: workspaceId!,
          status: 'won',
          wonAt: { gte: monthStart },
        },
      }),

      db.deal.aggregate({
        where: { workspaceId: workspaceId!, status: 'active' },
        _sum: { value: true },
      }),

      // Avg response time: calculate from agentLog latency last 24h
      db.agentLog.aggregate({
        where: {
          conversation: { workspaceId: workspaceId! },
          createdAt: { gte: last24h },
          ...(agentId ? { agentId } : {}),
        },
        _avg: { latencyMs: true },
      }),
    ])

    // ─── AI reply rate today ──────────────────────────────────
    const iaReplyRate = messagesToday > 0
      ? Math.round((aiMessagesToday / messagesToday) * 100) / 100
      : 0

    // ─── Hot leads (score >= 70) ──────────────────────────────
    const hotLeads = await db.contact.count({
      where: { workspaceId: workspaceId!, leadScore: { gte: 70 } },
    })

    // ─── Latest 5 conversations ───────────────────────────────
    const latestConversations = await db.conversation.findMany({
      where: { ...convWhere, status: 'active' },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: {
        id: true,
        channel: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        contact: {
          select: { id: true, firstName: true, lastName: true, leadScore: true },
        },
      },
    })

    return Response.json({
      timestamp: now.toISOString(),
      metrics: {
        totalContacts,
        newContactsToday,
        activeConversations,
        messagesToday,
        aiMessagesToday,
        iaReplyRate,
        openDeals,
        dealsWonThisMonth,
        pipelineValue: pipelineValue._sum.value ?? 0,
        avgResponseMs: Math.round(avgResponseMs._avg.latencyMs ?? 0),
        hotLeads,
      },
      latestConversations,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
