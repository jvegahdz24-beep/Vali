// ═══════════════════════════════════════════════════════════════
// Admin — Support Tickets
// GET  /api/admin/support  — list tickets
// POST /api/admin/support  — create ticket (admin creates on behalf of user)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createTicketSchema = z.object({
  userName: z.string().min(1).max(100),
  userEmail: z.string().email(),
  subject: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  category: z.enum(['general', 'billing', 'technical', 'feature_request', 'bug']).default('general'),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const priority = searchParams.get('priority') || ''
    const category = searchParams.get('category') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (priority) where.priority = priority
    if (category) where.category = category
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { userEmail: { contains: search } },
        { userName: { contains: search } },
      ]
    }

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      db.supportTicket.count({ where }),
    ])

    return NextResponse.json({
      tickets,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/support GET]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const body = await request.json()
    const data = createTicketSchema.parse(body)

    const ticket = await db.supportTicket.create({ data })

    return NextResponse.json({ ticket, message: 'Ticket creado' }, { status: 201 })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
