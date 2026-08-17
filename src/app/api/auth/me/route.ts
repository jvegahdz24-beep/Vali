// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Get Current User API Endpoint
// GET /api/auth/me — Return authenticated user info from JWT
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No autenticado', code: 'UNAUTHENTICATED' },
        { status: 401 }
      )
    }

    // Verify JWT token
    const payload = await verifySessionToken(sessionToken)

    if (!payload) {
      return NextResponse.json(
        { error: 'Sesión inválida o expirada', code: 'INVALID_SESSION' },
        { status: 401 }
      )
    }

    // Fetch user info from DB to get latest data
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        timezone: true,
        locale: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' },
        { status: 401 }
      )
    }

    // Get workspace info — prefer ACTIVE workspace
    const members = await db.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            logo: true,
          },
        },
      },
    })

    const member = members.find(m => m.workspace.isActive) || members[0] || null

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image,
        timezone: user.timezone,
        locale: user.locale,
        workspaceId: member?.workspace.id,
        workspaceName: member?.workspace.name,
        workspaceSlug: member?.workspace.slug,
        workspaceLogo: member?.workspace.logo || null,
        // Per-workspace role (owner/admin/member/viewer) — drives RBAC in the UI.
        // Distinct from `role` above which is the global platform role.
        workspaceRole: member?.role ?? null,
      },
    })
  } catch (error) {
    console.error('[Auth Me Error]', error)
    return NextResponse.json(
      { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
