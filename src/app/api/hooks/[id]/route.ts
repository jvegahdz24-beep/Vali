// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Hook [id] API
// PUT    /api/hooks/[id]  — update text / category / isActive
// DELETE /api/hooks/[id]  — soft-delete
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateSchema = z.object({
  workspaceId: z.string().min(1),
  text: z.string().min(1).max(2000).optional(),
  category: z.enum(['scarcity', 'urgency', 'social_proof', 'reciprocity', 'microclose', 'objection']).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { workspaceId, ...rest } = parsed.data
    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.hook.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return Response.json({ error: 'Hook no encontrado' }, { status: 404 })
    }

    const hook = await db.hook.update({ where: { id }, data: rest })
    return Response.json({ success: true, hook })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.hook.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return Response.json({ error: 'Hook no encontrado' }, { status: 404 })
    }

    await db.hook.update({ where: { id }, data: { isActive: false } })
    return Response.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
