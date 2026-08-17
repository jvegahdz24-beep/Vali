// Agenda de publicaciones.
// GET ?workspaceId         → lista (pendientes + recientes)
// POST {workspaceId,carId,networks,formats,templates,caption?,scheduledAt,withVideo?,videoConfig?}
// DELETE ?id&workspaceId   → cancela una pendiente
// RBAC: crm.write.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const posts = await db.scheduledPost.findMany({ where: { workspaceId }, orderBy: { scheduledAt: 'asc' }, take: 100 })
    return Response.json({ posts })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const b = await req.json() as { workspaceId: string; carId: string; networks?: string[]; formats?: string[]; templates?: Record<string, string>; caption?: string; scheduledAt: string; withVideo?: boolean; videoConfig?: unknown }
    const member = await requireWorkspace(b.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!b.carId) throw new ApiError(400, 'Falta el auto')
    const when = new Date(b.scheduledAt)
    if (isNaN(when.getTime())) throw new ApiError(400, 'Fecha/hora inválida')
    if (when.getTime() < Date.now() - 60_000) throw new ApiError(400, 'La fecha debe ser futura')
    const sp = await db.scheduledPost.create({
      data: {
        workspaceId: b.workspaceId, carId: b.carId,
        networks: JSON.stringify(b.networks || ['facebook', 'instagram']),
        formats: JSON.stringify(b.formats || ['feed', 'story']),
        templates: JSON.stringify(b.templates || {}),
        caption: b.caption || null, withVideo: !!b.withVideo,
        videoConfig: b.withVideo ? JSON.stringify(b.videoConfig || {}) : null,
        scheduledAt: when,
      },
    })
    return Response.json({ success: true, post: sp })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id') || ''
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    await db.scheduledPost.updateMany({ where: { id, workspaceId, status: 'pending' }, data: { status: 'cancelled' } })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
