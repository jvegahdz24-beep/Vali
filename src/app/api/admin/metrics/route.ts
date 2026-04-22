// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Admin Metrics API
// GET /api/admin/metrics — Real business metrics
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

    // Core counts
    const [
      totalContacts,
      totalConversations,
      totalDeals,
      activeDeals,
      wonDeals,
      lostDeals,
      totalMessages,
      totalAgents,
    ] = await Promise.all([
      db.contact.count({ where: { workspaceId: workspaceId! } }),
      db.conversation.count({ where: { workspaceId: workspaceId! } }),
      db.deal.count({ where: { workspaceId: workspaceId! } }),
      db.deal.count({ where: { workspaceId: workspaceId!, status: 'active' } }),
      db.deal.count({ where: { workspaceId: workspaceId!, status: 'won' } }),
      db.deal.count({ where: { workspaceId: workspaceId!, status: 'lost' } }),
      db.message.count({ where: { conversation: { workspaceId: workspaceId! } } }),
      db.agent.count({ where: { workspaceId: workspaceId! } }),
    ])

    // Revenue
    const revenueAgg = await db.deal.aggregate({
      _sum: { value: true },
      where: { workspaceId: workspaceId!, status: 'won' },
    })
    const totalRevenue = revenueAgg._sum.value || 0

    // Pipeline value (active deals)
    const pipelineAgg = await db.deal.aggregate({
      _sum: { value: true },
      where: { workspaceId: workspaceId!, status: 'active' },
    })
    const pipelineValue = pipelineAgg._sum.value || 0

    // Month-over-month: this month vs last month
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)

    const [thisMonthContacts, lastMonthContacts, thisMonthDeals, lastMonthDeals] =
      await Promise.all([
        db.contact.count({
          where: { workspaceId: workspaceId!, createdAt: { gte: thisMonthStart } },
        }),
        db.contact.count({
          where: { workspaceId: workspaceId!, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } },
        }),
        db.deal.count({
          where: { workspaceId: workspaceId!, createdAt: { gte: thisMonthStart } },
        }),
        db.deal.count({
          where: { workspaceId: workspaceId!, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } },
        }),
      ])

    const contactsGrowth = lastMonthContacts > 0
      ? Math.round(((thisMonthContacts - lastMonthContacts) / lastMonthContacts) * 100)
      : thisMonthContacts > 0 ? 100 : 0

    const dealsGrowth = lastMonthDeals > 0
      ? Math.round(((thisMonthDeals - lastMonthDeals) / lastMonthDeals) * 100)
      : thisMonthDeals > 0 ? 100 : 0

    // Funnel data: contacts -> conversations -> deals -> won
    const contactedContacts = await db.contact.count({
      where: {
        workspaceId: workspaceId!,
        lastMessageAt: { not: null },
      },
    })

    const qualifiedDeals = await db.deal.count({
      where: {
        workspaceId: workspaceId!,
        status: { in: ['active', 'won'] },
      },
    })

    // Team performance: per-member stats
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: workspaceId! },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    const teamPerformance = await Promise.all(
      members.map(async (member) => {
        const assignedConversations = await db.conversation.count({
          where: { workspaceId: workspaceId!, assignedTo: member.userId },
        })
        const assignedDeals = await db.deal.count({
          where: { workspaceId: workspaceId!, assignedTo: member.userId },
        })
        const wonDealsForMember = await db.deal.count({
          where: { workspaceId: workspaceId!, assignedTo: member.userId, status: 'won' },
        })
        const revenueForMember = await db.deal.aggregate({
          _sum: { value: true },
          where: { workspaceId: workspaceId!, assignedTo: member.userId, status: 'won' },
        })

        const conversionRate = assignedDeals > 0
          ? Math.round((wonDealsForMember / assignedDeals) * 100)
          : 0

        const score = Math.min(
          Math.round(
            (assignedConversations * 0.2) +
            (wonDealsForMember * 15) +
            ((revenueForMember._sum.value || 0) / 1000) +
            (conversionRate * 0.5)
          ),
          100
        )

        return {
          id: member.userId,
          nombre: member.user.name || member.user.email || 'Sin nombre',
          leads: assignedConversations,
          conversion: conversionRate,
          enLinea: true, // We don't track real-time presence
          score,
        }
      })
    )

    // Workspace info
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId! },
      select: { name: true, plan: true, createdAt: true },
    })

    // Subscription info
    const subscription = await db.subscription.findUnique({
      where: { workspaceId: workspaceId! },
    })

    const mrr = subscription?.amount || 0
    const plan = workspace?.plan || 'free'

    return Response.json({
      metrics: {
        mrrTotal: mrr,
        totalContacts,
        totalConversations,
        totalDeals,
        activeDeals,
        wonDeals,
        lostDeals,
        totalMessages,
        totalAgents,
        totalRevenue,
        pipelineValue,
        contactsGrowth,
        dealsGrowth,
        contactsThisMonth: thisMonthContacts,
        dealsThisMonth: thisMonthDeals,
      },
      funnel: [
        { etapa: 'Lead', valor: totalContacts, pct: 100 },
        {
          etapa: 'Contactado',
          valor: contactedContacts,
          pct: totalContacts > 0 ? Math.round((contactedContacts / totalContacts) * 100) : 0,
        },
        {
          etapa: 'Calificado',
          valor: qualifiedDeals,
          pct: totalContacts > 0 ? Math.round((qualifiedDeals / totalContacts) * 100) : 0,
        },
        {
          etapa: 'En Proceso',
          valor: activeDeals,
          pct: totalContacts > 0 ? Math.round((activeDeals / totalContacts) * 100) : 0,
        },
        {
          etapa: 'Ganado',
          valor: wonDeals,
          pct: totalContacts > 0 ? Math.round((wonDeals / totalContacts) * 100) : 0,
        },
      ],
      team: teamPerformance,
      workspace: {
        name: workspace?.name || '',
        plan,
        mrr,
        status: subscription?.status || 'active',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
