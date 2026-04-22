// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Dashboard Stats API
// GET /api/dashboard/stats — Aggregated dashboard metrics
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

    // Use OR with stage.isWon/isLost for resilience
    const wonWhere = { workspaceId: workspaceId!, OR: [{ status: 'won' }, { stage: { isWon: true } }] }
    const lostWhere = { workspaceId: workspaceId!, OR: [{ status: 'lost' }, { stage: { isLost: true } }] }
    const activeWhere = { workspaceId: workspaceId!, status: 'active', stage: { isWon: false, isLost: false } }

    // Run all queries in parallel for performance
    const [
      totalContacts,
      activeConversations,
      dealsWon,
      dealsLost,
      openDeals,
      messagesToday,
      aiMessagesSent,
      activeAgents,
      pipelineDeals,
    ] = await Promise.all([
      // Total contacts (active only)
      db.contact.count({
        where: { workspaceId: workspaceId!, status: 'active' },
      }),

      // Active conversations
      db.conversation.count({
        where: { workspaceId: workspaceId!, status: 'active' },
      }),

      // Deals won
      db.deal.count({ where: wonWhere }),

      // Deals lost
      db.deal.count({ where: lostWhere }),

      // Open/active deals
      db.deal.count({ where: activeWhere }),

      // Messages today
      db.message.count({
        where: {
          conversation: { workspaceId: workspaceId! },
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),

      // AI messages sent
      db.message.count({
        where: {
          conversation: { workspaceId: workspaceId! },
          isAiGenerated: true,
        },
      }),

      // Active agents
      db.agent.count({
        where: { workspaceId: workspaceId!, isActive: true },
      }),

      // Pipeline value (sum of active deals, excluding won/lost stages)
      db.deal.aggregate({
        where: activeWhere,
        _sum: { value: true },
      }),
    ])

    // Total revenue (sum of won deals)
    const revenueResult = await db.deal.aggregate({
      where: wonWhere,
      _sum: { value: true },
    })

    const totalRevenue = (revenueResult._sum?.value as number) || 0
    const pipelineValue = (pipelineDeals._sum?.value as number) || 0

    // Conversion rate (won / (won + lost) * 100)
    const totalClosed = dealsWon + dealsLost
    const conversionRate = totalClosed > 0 ? Math.round((dealsWon / totalClosed) * 100) : 0

    // Deals by stage for mini chart
    const dealsByStage = (await db.pipelineStage.findMany({
      where: {
        pipeline: { workspaceId: workspaceId! },
      },
      include: {
        _count: { select: { deals: { where: { status: 'active' } } } },
        deals: {
          where: { status: 'active' },
          select: { value: true },
        },
      },
      orderBy: { order: 'asc' },
    })) as Array<any>

    const stageData = dealsByStage.map((stage: any) => ({
      name: stage.name,
      color: stage.color,
      dealCount: stage._count?.deals || 0,
      totalValue: (stage.deals || []).reduce((sum: number, d: any) => sum + (d.value || 0), 0),
      probability: stage.probability,
      weightedValue: (stage.deals || []).reduce((sum: number, d: any) => sum + (d.value || 0), 0) * (stage.probability / 100),
    }))

    // Recent contacts (last 5)
    const recentContacts = await db.contact.findMany({
      where: { workspaceId: workspaceId!, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        leadScore: true,
        source: true,
        lastMessageAt: true,
        createdAt: true,
      },
    })

    // Recent conversations (last 5) — only include those with a contact
    const recentConversations = await db.conversation.findMany({
      where: { workspaceId: workspaceId!, contactId: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            leadScore: true,
          },
        },
      },
    })

    return Response.json({
      totalContacts,
      activeConversations,
      dealsWon,
      dealsLost,
      openDeals,
      totalRevenue,
      pipelineValue,
      conversionRate,
      messagesToday,
      aiMessagesSent,
      activeAgents,
      stages: stageData,
      recentContacts,
      recentConversations,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
