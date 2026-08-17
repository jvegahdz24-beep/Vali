// ═══════════════════════════════════════════════════════════════
// Perfil del usuario — GET /api/profile (detalle) · PUT (editar nombre)
// Devuelve: usuario, rol, workspace, plan y últimas sesiones propias.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse, ApiError, getPlanLimits } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true, telegramChatId: true },
    })
    if (!user) throw new ApiError(404, 'Usuario no encontrado')

    const member = session.workspaceId
      ? await db.workspaceMember.findFirst({
          where: { userId: user.id, workspaceId: session.workspaceId },
          include: { workspace: { select: { id: true, name: true, plan: true, createdAt: true } } },
        })
      : null

    let planName: string | undefined
    try { if (session.workspaceId) planName = (await getPlanLimits(session.workspaceId)).planName } catch { /* */ }

    const sessions = session.workspaceId
      ? await db.accessSession.findMany({
          where: { workspaceId: session.workspaceId, userId: user.id },
          orderBy: { lastSeenAt: 'desc' }, take: 5,
          select: { id: true, ip: true, browser: true, os: true, device: true, city: true, country: true, isActive: true, createdAt: true },
        }).catch(() => [])
      : []

    return Response.json({
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, telegramLinked: !!user.telegramChatId },
      membership: member ? { role: member.role, joinedAt: member.joinedAt } : null,
      workspace: member?.workspace ? { id: member.workspace.id, name: member.workspace.name, plan: planName || member.workspace.plan, since: member.workspace.createdAt } : null,
      sessions: sessions.map((s) => ({ ...s, device: [s.browser, s.os, s.device].filter(Boolean).join(' · ') || null, location: [s.city, s.country].filter(Boolean).join(', ') || null })),
    })
  } catch (error) { return errorResponse(error) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { name?: string }
    const name = String(body.name || '').trim()
    if (!name || name.length < 2) throw new ApiError(400, 'El nombre debe tener al menos 2 caracteres')
    await db.user.update({ where: { id: session.userId }, data: { name: name.slice(0, 120) } })
    return Response.json({ success: true, name })
  } catch (error) { return errorResponse(error) }
}
