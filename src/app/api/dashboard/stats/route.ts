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

    // ── Deltas REALES calculados desde la BD (no inventados) ──
    // Ventanas de tiempo
    const _now = new Date()
    const _dayAgo = new Date(_now.getTime() - 24 * 60 * 60 * 1000)
    const _startToday = new Date(new Date().setHours(0, 0, 0, 0))
    const _startYesterday = new Date(_startToday.getTime() - 24 * 60 * 60 * 1000)
    const _startMonth = new Date(_now.getFullYear(), _now.getMonth(), 1)
    const _startPrevMonth = new Date(_now.getFullYear(), _now.getMonth() - 1, 1)

    const [
      contactsDayAgo,       // contactos que existían hace 24h
      revenueTodayAgg,      // ingresos de tratos ganados HOY
      revenueYesterdayAgg,  // ingresos de tratos ganados AYER
      revenueMonthAgg,      // ingresos ganados este mes
      revenuePrevMonthAgg,  // ingresos ganados mes anterior
    ] = await Promise.all([
      db.contact.count({ where: { workspaceId: workspaceId!, status: 'active', createdAt: { lt: _dayAgo } } }),
      db.deal.aggregate({ where: { ...wonWhere, updatedAt: { gte: _startToday } }, _sum: { value: true } }),
      db.deal.aggregate({ where: { ...wonWhere, updatedAt: { gte: _startYesterday, lt: _startToday } }, _sum: { value: true } }),
      db.deal.aggregate({ where: { ...wonWhere, updatedAt: { gte: _startMonth } }, _sum: { value: true } }),
      db.deal.aggregate({ where: { ...wonWhere, updatedAt: { gte: _startPrevMonth, lt: _startMonth } }, _sum: { value: true } }),
    ])

    const revenueToday = (revenueTodayAgg._sum?.value as number) || 0
    const revenueYesterday = (revenueYesterdayAgg._sum?.value as number) || 0
    const revenueMonth = (revenueMonthAgg._sum?.value as number) || 0
    const revenuePrevMonth = (revenuePrevMonthAgg._sum?.value as number) || 0

    const pctDelta = (now: number, prev: number): { pct: number; dir: 'up' | 'down' | 'flat' } | null => {
      if (prev <= 0) return now > 0 ? { pct: 100, dir: 'up' } : null
      const pct = Math.round(((now - prev) / prev) * 100)
      return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
    }

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

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId! },
      select: { createdAt: true, name: true, settings: true },
    })

    // ── Snapshot diario → "% vs ayer" REAL (no inventado) ──
    // Guarda una foto de las métricas 1 vez al día en settings.dashboardSnapshots
    // y compara contra el día previo más reciente para calcular el cambio.
    const changes: Record<string, { pct: number; dir: 'up' | 'down' | 'flat' }> = {}
    try {
      let s: Record<string, unknown> = {}
      try { s = JSON.parse(workspace?.settings || '{}') } catch { /* */ }
      const snaps = ((s.dashboardSnapshots as Record<string, Record<string, number>>) || {})
      const today = new Date().toISOString().slice(0, 10)
      const current: Record<string, number> = { totalContacts, activeConversations, totalRevenue, conversionRate, aiMessagesSent, dealsWon }
      const priorDates = Object.keys(snaps).filter((d) => d < today).sort()
      const base = priorDates.length ? snaps[priorDates[priorDates.length - 1]] : null
      if (base) {
        for (const k of Object.keys(current)) {
          const prev = Number(base[k] ?? 0), now = current[k]
          if (prev > 0) {
            const pct = Math.round(((now - prev) / prev) * 100)
            changes[k] = { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }
          }
        }
      }
      // Escribe la foto de HOY una sola vez al día (re-lee settings para no pisar otras claves).
      if (!snaps[today]) {
        const fresh = await db.workspace.findUnique({ where: { id: workspaceId! }, select: { settings: true } })
        let s2: Record<string, unknown> = {}
        try { s2 = JSON.parse(fresh?.settings || '{}') } catch { /* */ }
        const snaps2 = ((s2.dashboardSnapshots as Record<string, Record<string, number>>) || {})
        snaps2[today] = current
        const keep = Object.keys(snaps2).sort().slice(-8)
        const pruned: Record<string, Record<string, number>> = {}
        for (const d of keep) pruned[d] = snaps2[d]
        s2.dashboardSnapshots = pruned
        await db.workspace.update({ where: { id: workspaceId! }, data: { settings: JSON.stringify(s2) } }).catch(() => {})
      }
    } catch { /* no crítico */ }

    // Deltas reales (createdAt/updatedAt) — tienen prioridad y aparecen HOY mismo
    const dContacts = pctDelta(totalContacts, contactsDayAgo)
    if (dContacts) changes.totalContacts = dContacts
    const dRevMonth = pctDelta(revenueMonth, revenuePrevMonth)
    if (dRevMonth) changes.totalRevenue = dRevMonth
    const dRevToday = pctDelta(revenueToday, revenueYesterday)
    if (dRevToday) changes.revenueToday = dRevToday

    return Response.json({
      totalContacts,
      activeConversations,
      dealsWon,
      dealsLost,
      openDeals,
      totalRevenue,
      revenueToday,
      revenueMonth,
      pipelineValue,
      conversionRate,
      messagesToday,
      aiMessagesSent,
      activeAgents,
      stages: stageData,
      recentContacts,
      recentConversations,
      changes,
      workspaceCreatedAt: workspace?.createdAt ?? null,
      workspaceName: workspace?.name ?? null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
