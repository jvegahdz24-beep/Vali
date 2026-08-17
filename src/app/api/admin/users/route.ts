// ═══════════════════════════════════════════════════════════════
// Admin — Users Management
// GET /api/admin/users  — list with search, filter, pagination
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
    const role = searchParams.get('role') || ''
    const plan = searchParams.get('plan') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const skip = (page - 1) * limit
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ]
    }

    if (role) where.role = role

    // If filtering by plan, we need to join through workspaces
    if (plan) {
      where.ownedWorkspaces = {
        some: { plan },
      }
    }

    const orderBy: Record<string, string> = {}
    if (['createdAt', 'name', 'email', 'role'].includes(sortBy)) {
      orderBy[sortBy] = sortDir
    } else {
      orderBy.createdAt = 'desc'
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          image: true,
          phone: true,
          timezone: true,
          locale: true,
          ownedWorkspaces: {
            select: {
              id: true,
              name: true,
              plan: true,
              isActive: true,
              subscription: {
                select: {
                  plan: true,
                  status: true,
                  trialEnd: true,
                  amount: true,
                  currency: true,
                },
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
      db.user.count({ where }),
    ])

    return NextResponse.json({
      users,
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
    console.error('[admin/users]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
