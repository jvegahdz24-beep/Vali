// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Team Member API (Single Member)
// PUT /api/teams/:id — Update member role
// DELETE /api/teams/:id — Remove member from workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { role, workspaceId } = body

    if (!role || !workspaceId) {
      return Response.json({ error: 'role y workspaceId son requeridos' }, { status: 400 })
    }

    // Solo owner/admin del workspace pueden cambiar roles.
    const caller = await requireWorkspace(workspaceId, session.userId)
    requirePermission(caller.role, 'team.manage')

    const validRoles = ['owner', 'admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return Response.json({ error: `Rol inválido. Valores permitidos: ${validRoles.join(', ')}` }, { status: 400 })
    }

    // Verify the member exists and belongs to the workspace
    const member = await db.workspaceMember.findUnique({
      where: { id },
      include: {
        workspace: {
          select: { ownerId: true },
        },
      },
    })

    if (!member) {
      return Response.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    if (member.workspaceId !== workspaceId) {
      return Response.json({ error: 'El miembro no pertenece a este espacio de trabajo' }, { status: 403 })
    }

    // Cannot change role of workspace owner via this endpoint
    if (member.userId === member.workspace.ownerId) {
      return Response.json({ error: 'No se puede cambiar el rol del propietario' }, { status: 403 })
    }

    const updated = await db.workspaceMember.update({
      where: { id },
      data: { role },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    })

    return Response.json({ success: true, member: updated })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return Response.json({ error: 'workspaceId es requerido' }, { status: 400 })
    }

    // Solo owner/admin del workspace pueden eliminar miembros.
    const caller = await requireWorkspace(workspaceId, session.userId)
    requirePermission(caller.role, 'team.manage')

    // Verify member exists
    const member = await db.workspaceMember.findUnique({
      where: { id },
      include: {
        workspace: {
          select: { ownerId: true },
        },
      },
    })

    if (!member) {
      return Response.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    if (member.workspaceId !== workspaceId) {
      return Response.json({ error: 'El miembro no pertenece a este espacio de trabajo' }, { status: 403 })
    }

    // Cannot remove workspace owner
    if (member.userId === member.workspace.ownerId) {
      return Response.json({ error: 'No se puede eliminar al propietario del espacio de trabajo' }, { status: 403 })
    }

    await db.workspaceMember.delete({
      where: { id },
    })

    return Response.json({ success: true, message: 'Miembro eliminado correctamente' })
  } catch (error) {
    return errorResponse(error)
  }
}
