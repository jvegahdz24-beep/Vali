// ═══════════════════════════════════════════════════════════════
// ValiGuard — Gestión de sesiones activas.
// PATCH /api/valiguard/sessions — revocar una sesión (cerrar acceso)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, id } = body as { workspaceId?: string; id?: string }
    if (!workspaceId || !id) return Response.json({ error: 'workspaceId e id son requeridos' }, { status: 400 })

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'team.manage')

    const existing = await db.accessSession.findFirst({ where: { id, workspaceId } })
    if (!existing) return Response.json({ error: 'Sesión no encontrada' }, { status: 404 })

    await db.accessSession.update({ where: { id }, data: { isActive: false, revokedAt: new Date() } })
    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
