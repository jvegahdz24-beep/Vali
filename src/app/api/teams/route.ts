import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

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
            updatedAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })) as Array<any>

    // Get message counts per user for activity tracking
    const workspaceConversations = await db.conversation.findMany({
      where: { workspaceId: workspaceId! },
      select: { id: true },
    })
    const convIds = workspaceConversations.map((c) => c.id)

    const messageCounts: Record<string, number> = {}
    if (convIds.length > 0) {
      const senderStats = await db.message.groupBy({
        by: ['senderId'],
        where: {
          conversationId: { in: convIds },
          direction: 'outbound',
          senderId: { not: null },
        },
        _count: { id: true },
      })
      for (const stat of senderStats) {
        if (stat.senderId) {
          messageCounts[stat.senderId] = stat._count.id
        }
      }
    }

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

    // ── Comisiones por vendedor ──
    // Al cerrarse un trato GANADO, al asesor asignado se le acredita un % del
    // valor (configurable en settings.commissionRate). Aquí sumamos, por
    // usuario, el valor de sus tratos ganados y calculamos su comisión.
    let commissionRate = 0
    try { commissionRate = Number(JSON.parse(workspace?.settings || '{}').commissionRate) || 0 } catch { /* */ }
    const wonDeals = await db.deal.findMany({
      where: { workspaceId: workspaceId!, OR: [{ status: 'won' }, { stage: { isWon: true } }] },
      select: { assignedTo: true, value: true },
    }).catch(() => [] as { assignedTo: string | null; value: number }[])
    const wonByUser: Record<string, { count: number; total: number }> = {}
    for (const d of wonDeals) {
      const uid = d.assignedTo || '__unassigned__'
      if (!wonByUser[uid]) wonByUser[uid] = { count: 0, total: 0 }
      wonByUser[uid].count += 1
      wonByUser[uid].total += d.value || 0
    }
    const commissionFor = (userId: string) => {
      const w = wonByUser[userId]
      if (!w) return { wonDeals: 0, wonValue: 0, commission: 0 }
      return { wonDeals: w.count, wonValue: w.total, commission: Math.round(w.total * commissionRate) / 100 }
    }

    // Build response with owner + members
    const response: Array<{
      id: string
      userId: string
      workspaceId: string
      role: string
      joinedAt: string
      lastActivity?: string | null
      messagesSent?: number
      wonDeals?: number
      wonValue?: number
      commission?: number
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
        lastActivity: workspace.owner.updatedAt?.toISOString() || null,
        messagesSent: messageCounts[workspace.ownerId!] || 0,
        ...commissionFor(workspace.ownerId!),
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
        lastActivity: member.user.updatedAt?.toISOString() || null,
        messagesSent: messageCounts[member.userId] || 0,
        ...commissionFor(member.userId),
        user: member.user,
      })
    }

    return Response.json({ success: true, members: response, commissionRate })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { workspaceId, email, role } = body

    const caller = await requireWorkspace(workspaceId, session.userId)
    requirePermission(caller.role, 'team.manage')

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

    const caller = await requireWorkspace(workspaceId, session.userId)
    requirePermission(caller.role, 'team.manage')

    await db.workspaceMember.delete({
      where: { id: memberId },
    })

    return Response.json({ success: true, message: 'Miembro eliminado' })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { memberId, role, workspaceId } = body

    if (!memberId || !role || !workspaceId) {
      return Response.json({ success: false, error: 'memberId, role y workspaceId requeridos' }, { status: 400 })
    }

    const caller = await requireWorkspace(workspaceId, session.userId)
    requirePermission(caller.role, 'team.manage')

    const validRoles = ['owner', 'admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return Response.json({ success: false, error: `Rol inválido. Valores permitidos: ${validRoles.join(', ')}` }, { status: 400 })
    }

    const member = await db.workspaceMember.update({
      where: { id: memberId },
      data: { role },
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
