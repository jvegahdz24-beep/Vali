// ═══════════════════════════════════════════════════════════════
// Admin — Revenue Analytics
// GET /api/admin/revenue
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'

const planPrices: Record<string, number> = {
  free: 0, trial: 0, starter: 4300, pro: 7800, enterprise: 35500,
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const now = new Date()
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleString('es-MX', { month: 'short', year: '2-digit' }),
      }
    }).reverse()

    // Current paid subscriptions for MRR
    const activeSubs = await db.subscription.findMany({
      where: { status: 'active' },
      select: { plan: true, amount: true, currency: true, currentPeriodStart: true },
    })

    const mrr = activeSubs.reduce((sum, sub) => {
      return sum + (sub.amount || planPrices[sub.plan] || 0)
    }, 0)

    // Revenue by plan
    const revenueByPlan = [
      { plan: 'Starter', price: 4300, count: activeSubs.filter(s => s.plan === 'starter').length },
      { plan: 'Pro', price: 7800, count: activeSubs.filter(s => s.plan === 'pro').length },
      { plan: 'Enterprise', price: 35500, count: activeSubs.filter(s => s.plan === 'enterprise').length },
    ].map(p => ({ ...p, revenue: p.price * p.count }))

    // Monthly new subscriptions (paid) in last 12 months
    const monthlyNewSubs = await db.$queryRaw<{ year: number; month: number; count: number; plan: string }[]>`
      SELECT 
        YEAR(currentPeriodStart) as year,
        MONTH(currentPeriodStart) as month,
        COUNT(*) as count,
        plan
      FROM Subscription
      WHERE status = 'active' AND plan NOT IN ('free', 'trial')
        AND currentPeriodStart >= ${new Date(now.getFullYear() - 1, now.getMonth(), 1)}
      GROUP BY YEAR(currentPeriodStart), MONTH(currentPeriodStart), plan
      ORDER BY year ASC, month ASC
    `

    const monthlyRevenue = last12Months.map(m => {
      const subs = monthlyNewSubs.filter(s => s.year === m.year && s.month === m.month)
      const revenue = subs.reduce((sum, s) => {
        return sum + (planPrices[s.plan] || 0) * Number(s.count)
      }, 0)
      return {
        month: m.label,
        revenue,
        newSubs: subs.reduce((sum, s) => sum + Number(s.count), 0),
      }
    })

    // Churn: cancelled in last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const cancelledLast30Days = await db.subscription.count({
      where: { status: 'cancelled', cancelledAt: { gte: thirtyDaysAgo } },
    })

    // Trial to paid conversion (approx: count paid subs whose workspace had trial before)
    const trialSubs = await db.subscription.count({ where: { plan: 'trial' } })
    const paidSubs = activeSubs.filter(s => !['free', 'trial'].includes(s.plan)).length
    const totalEverStarted = paidSubs + trialSubs
    const conversionRate = totalEverStarted > 0 ? (paidSubs / totalEverStarted) * 100 : 0

    return NextResponse.json({
      summary: {
        mrr,
        arr: mrr * 12,
        totalPaidAccounts: paidSubs,
        cancelledLast30Days,
        conversionRate: Math.round(conversionRate * 10) / 10,
        averageRevenue: paidSubs > 0 ? Math.round(mrr / paidSubs) : 0,
      },
      revenueByPlan,
      monthlyRevenue,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/revenue]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
