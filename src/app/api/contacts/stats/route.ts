// ═══════════════════════════════════════════════════════════════
// Contactos — KPIs reales para la vista tipo mockup.
// GET /api/contacts/stats?workspaceId=
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
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const base = { workspaceId, status: { not: 'archived' } }

    const [
      total, newThisMonth, newPrevMonth, hotLeads, noContact30d,
      clientes, prospectos, leads,
    ] = await Promise.all([
      db.contact.count({ where: base }),
      db.contact.count({ where: { ...base, createdAt: { gte: startMonth } } }),
      db.contact.count({ where: { ...base, createdAt: { gte: startPrevMonth, lt: startMonth } } }),
      db.contact.count({ where: { ...base, leadScore: { gte: 70 } } }),
      db.contact.count({ where: { ...base, OR: [{ lastMessageAt: { lt: d30 } }, { lastMessageAt: null }] } }),
      // Clientes: trato ganado O etiqueta 'cliente' (la pone solo el sistema al ganar)
      db.contact.count({ where: { ...base, OR: [{ deals: { some: { OR: [{ status: 'won' }, { stage: { isWon: true } }] } } }, { tags: { contains: '"cliente"' } }] } }).catch(() => 0),
      db.contact.count({ where: { ...base, leadScore: { gte: 40, lt: 70 } } }),
      db.contact.count({ where: { ...base, leadScore: { lt: 40 } } }),
    ])

    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0))

    // Origen de los leads por canal (total y calientes) — "¿qué canal nos trae
    // los leads que sí compran?" para dirigir el presupuesto de marketing.
    type SrcRow = { source: string | null; _count: { _all: number } }
    const [srcTotal, srcHot] = await Promise.all([
      db.contact.groupBy({ by: ['source'], where: base, _count: { _all: true } }).catch(() => [] as SrcRow[]),
      db.contact.groupBy({ by: ['source'], where: { ...base, leadScore: { gte: 70 } }, _count: { _all: true } }).catch(() => [] as SrcRow[]),
    ])
    const hotMap = new Map<string, number>((srcHot as SrcRow[]).map((r) => [r.source || 'otro', r._count._all]))
    const bySource = (srcTotal as SrcRow[])
      .map((r) => ({ source: r.source || 'otro', total: r._count._all, hot: hotMap.get(r.source || 'otro') || 0 }))
      .sort((a, b) => (b.hot - a.hot) || (b.total - a.total))
      .slice(0, 8)

    return NextResponse.json({
      bySource,
      total,
      newThisMonth, newThisMonthDelta: pct(newThisMonth, newPrevMonth),
      clientes,
      hotLeads,
      noContact30d,
      tabs: { todos: total, leads, clientes, prospectos, inactivos: noContact30d },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
