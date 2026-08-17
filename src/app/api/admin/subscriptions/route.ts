// ═══════════════════════════════════════════════════════════════
// Admin — Subscriptions Management
// GET /api/admin/subscriptions
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const plan = searchParams.get('plan') || ''
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (plan) where.plan = plan
    if (status) where.status = status

    if (search) {
      where.workspace = {
        OR: [
          { name: { contains: search } },
          { owner: { email: { contains: search } } },
          { owner: { name: { contains: search } } },
        ],
      }
    }

    const [subscriptions, total] = await Promise.all([
      db.subscription.findMany({
        where,
        orderBy: { currentPeriodStart: 'desc' },
        skip,
        take: limit,
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              plan: true,
              isActive: true,
              createdAt: true,
              owner: {
                select: { id: true, name: true, email: true },
              },
              _count: {
                select: {
                  contacts: true,
                  conversations: true,
                },
              },
            },
          },
        },
      }),
      db.subscription.count({ where }),
    ])

    return NextResponse.json({
      subscriptions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/subscriptions]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
