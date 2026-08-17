// ═══════════════════════════════════════════════════════════════
// Admin — Suggestions Management
// GET  /api/admin/suggestions
// POST /api/admin/suggestions
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createSuggestionSchema = z.object({
  userName: z.string().min(1).max(100),
  userEmail: z.string().email(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.enum(['feature', 'improvement', 'bug', 'other']).default('feature'),
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
    const category = searchParams.get('category') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const skip = (page - 1) * limit
    const sortBy = searchParams.get('sortBy') || 'createdAt'

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (category) where.category = category
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { userEmail: { contains: search } },
      ]
    }

    const orderBy: Record<string, string> = sortBy === 'votes'
      ? { votes: 'desc' }
      : { createdAt: 'desc' }

    const [suggestions, total] = await Promise.all([
      db.suggestion.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      db.suggestion.count({ where }),
    ])

    return NextResponse.json({
      suggestions,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[admin/suggestions GET]', error)
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
    const data = createSuggestionSchema.parse(body)

    const suggestion = await db.suggestion.create({ data })

    return NextResponse.json({ suggestion, message: 'Sugerencia creada' }, { status: 201 })
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
