import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const members = (await db.workspaceMember.findMany({
      where: { workspaceId: workspaceId! },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })) as Array<any>

    // Also get the workspace owner
    const workspace = (await db.workspace.findUnique({
      where: { id: workspaceId! },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })) as any

    // Build response with owner + members
    const response: Array<{
      id: string
      userId: string
      workspaceId: string
      role: string
      joinedAt: string
      user: { id: string; name: string | null; email: string; image?: string | null }
    }> = []

    // Add owner first
    if (workspace?.owner) {
      const isAlreadyMember = members.some((m) => m.userId === workspace.ownerId)
      response.push({
        id: `owner-${workspace.ownerId}`,
        userId: workspace.ownerId!,
        workspaceId: workspaceId!,
        role: 'owner',
        joinedAt: workspace.createdAt.toISOString(),
        user: workspace.owner,
      })

      if (isAlreadyMember) {
        // Owner has a WorkspaceMember entry — skip adding them again
      }
    }

    // Add non-owner members
    for (const member of members) {
      if (member.userId === workspace?.ownerId) continue // Skip owner (already added)
      response.push({
        id: member.id,
        userId: member.userId,
        workspaceId: member.workspaceId!,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
        user: member.user,
      })
    }

    return Response.json({ success: true, members: response })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { workspaceId, email, role } = body

    await requireWorkspace(workspaceId, session.userId)

    if (!email) {
      return Response.json({ success: false, error: 'email requerido' }, { status: 400 })
    }

    // Check if user exists
    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      return Response.json({ success: false, error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Check if already a member
    const existing = await db.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: user.id, workspaceId },
      },
    })

    if (existing) {
      return Response.json({ success: false, error: 'El usuario ya es miembro del equipo' }, { status: 409 })
    }

    // Create membership
    const member = await db.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId,
        role: role || 'member',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    })

    return Response.json({ success: true, member })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const memberId = searchParams.get('memberId')

    if (!memberId || !workspaceId) {
      return Response.json({ success: false, error: 'memberId y workspaceId requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    await db.workspaceMember.delete({
      where: { id: memberId },
    })

    return Response.json({ success: true, message: 'Miembro eliminado' })
  } catch (error) {
    return errorResponse(error)
  }
}
