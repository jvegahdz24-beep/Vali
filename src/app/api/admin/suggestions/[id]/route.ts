// ═══════════════════════════════════════════════════════════════
// Admin — Suggestion Detail
// GET    /api/admin/suggestions/[id]
// PATCH  /api/admin/suggestions/[id]
// DELETE /api/admin/suggestions/[id]
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateSuggestionSchema = z.object({
  status: z.enum(['pending', 'reviewing', 'accepted', 'rejected', 'implemented']).optional(),
  adminNotes: z.string().max(5000).optional().nullable(),
  votes: z.number().int().min(0).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const suggestion = await db.suggestion.findUnique({ where: { id } })

    if (!suggestion) {
      return NextResponse.json({ error: 'Sugerencia no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ suggestion })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const data = updateSuggestionSchema.parse(body)

    const suggestion = await db.suggestion.update({
      where: { id },
      data,
    })

    return NextResponse.json({ suggestion, message: 'Sugerencia actualizada' })
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    await db.suggestion.delete({ where: { id } })

    return NextResponse.json({ message: 'Sugerencia eliminada' })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
