// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — AI Training example (single)
// PATCH  /api/training/:id  — edit / toggle isActive
// DELETE /api/training/:id  — remove a lesson
// Requires agents.manage (owner/admin).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()

    const existing = await db.aiTrainingExample.findUnique({ where: { id } })
    if (!existing) return Response.json({ error: 'Lección no encontrada' }, { status: 404 })
    const member = await requireWorkspace(existing.workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')

    const data: Record<string, unknown> = {}
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive
    if (typeof body.trigger === 'string') data.trigger = body.trigger.trim()
    if (typeof body.goodResponse === 'string') data.goodResponse = body.goodResponse.trim()
    if (typeof body.badResponse === 'string') data.badResponse = body.badResponse.trim() || null
    if (typeof body.note === 'string') data.note = body.note.trim() || null
    if (body.type === 'correction' || body.type === 'example') data.type = body.type

    const updated = await db.aiTrainingExample.update({ where: { id }, data })
    return Response.json({ success: true, item: updated })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const existing = await db.aiTrainingExample.findUnique({ where: { id } })
    if (!existing) return Response.json({ error: 'Lección no encontrada' }, { status: 404 })
    const member = await requireWorkspace(existing.workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')

    await db.aiTrainingExample.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
