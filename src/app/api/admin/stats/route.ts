// ═══════════════════════════════════════════════════════════════
// Admin — Global Platform Statistics
// GET /api/admin/stats
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

    const [
      totalUsers,
      newUsersThisMonth,
      newUsersLastMonth,
      totalWorkspaces,
      activeWorkspaces,
      totalSubscriptions,
      trialSubs,
      paidSubs,
      starterSubs,
      proSubs,
      enterpriseSubs,
      cancelledSubs,
      totalContacts,
      totalConversations,
      totalMessages,
      totalDeals,
      wonDeals,
      openTickets,
      resolvedTickets,
      totalSuggestions,
      pendingSuggestions,
      newUsersLast7Days,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.user.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      db.workspace.count(),
      db.workspace.count({ where: { isActive: true } }),
      db.subscription.count(),
      db.subscription.count({ where: { plan: 'trial' } }),
      db.subscription.count({ where: { status: 'active' } }),
      db.subscription.count({ where: { plan: 'starter', status: 'active' } }),
      db.subscription.count({ where: { plan: 'pro', status: 'active' } }),
      db.subscription.count({ where: { plan: 'enterprise', status: 'active' } }),
      db.subscription.count({ where: { status: 'cancelled' } }),
      db.contact.count(),
      db.conversation.count(),
      db.message.count(),
      db.deal.count(),
      db.deal.count({ where: { status: 'won' } }),
      db.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      db.supportTicket.count({ where: { status: 'resolved' } }),
      db.suggestion.count(),
      db.suggestion.count({ where: { status: 'pending' } }),
      db.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    ])

    // Calculate MRR from paid subscriptions
    const activeSubs = await db.subscription.findMany({
      where: { status: 'active', plan: { not: 'free' } },
      select: { plan: true, amount: true },
    })

    const planPrices: Record<string, number> = {
      starter: 4300,
      pro: 7800,
      enterprise: 35500,
      trial: 0,
    }

    const mrr = activeSubs.reduce((sum, sub) => {
      const price = sub.amount || planPrices[sub.plan] || 0
      return sum + price
    }, 0)

    // User growth percentage
    const userGrowth = newUsersLastMonth > 0
      ? ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100
      : newUsersThisMonth > 0 ? 100 : 0

    // Last 30 days signup trend
    const signupTrend = await db.$queryRaw<{ date: string; count: number }[]>`
      SELECT 
        DATE(createdAt) as date, 
        COUNT(*) as count 
      FROM User 
      WHERE createdAt >= ${thirtyDaysAgo}
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `

    // Plan distribution
    const planDistribution = [
      { plan: 'free', count: await db.workspace.count({ where: { plan: 'free' } }), label: 'Free', color: '#6b7280' },
      { plan: 'trial', count: await db.subscription.count({ where: { plan: 'trial' } }), label: 'Trial', color: '#f59e0b' },
      { plan: 'starter', count: starterSubs, label: 'Starter', color: '#3b82f6' },
      { plan: 'pro', count: proSubs, label: 'Pro', color: '#8b5cf6' },
      { plan: 'enterprise', count: enterpriseSubs, label: 'Enterprise', color: '#10b981' },
    ]

    return NextResponse.json({
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        newLast7Days: newUsersLast7Days,
        growth: Math.round(userGrowth * 10) / 10,
      },
      workspaces: {
        total: totalWorkspaces,
        active: activeWorkspaces,
        inactive: totalWorkspaces - activeWorkspaces,
      },
      subscriptions: {
        total: totalSubscriptions,
        trial: trialSubs,
        paid: paidSubs,
        starter: starterSubs,
        pro: proSubs,
        enterprise: enterpriseSubs,
        cancelled: cancelledSubs,
      },
      revenue: {
        mrr,
        arr: mrr * 12,
      },
      platform: {
        totalContacts,
        totalConversations,
        totalMessages,
        totalDeals,
        wonDeals,
        dealWinRate: totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0,
      },
      support: {
        openTickets,
        resolvedTickets,
        totalSuggestions,
        pendingSuggestions,
      },
      charts: {
        signupTrend: signupTrend.map(r => ({
          date: String(r.date).substring(0, 10),
          count: Number(r.count),
        })),
        planDistribution,
      },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/stats]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
