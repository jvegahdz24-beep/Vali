// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Get Current User API Endpoint
// GET /api/auth/me — Return authenticated user profile + workspaces
// Requires: Authorization: Bearer <access_token>
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo, logOk, logWarn, logError } from '@/lib/logger'
import { verifyAccessToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─── Route Handler ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  logInfo('AUTH', 'me_start', {})

  try {
    // ─── Extract Bearer token from Authorization header ────
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      logWarn('AUTH', 'me_missing_auth_header', {})
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHENTICATED' },
        { status: 401 },
      )
    }

    const accessToken = authHeader.slice(7) // Strip "Bearer "
    if (!accessToken) {
      logWarn('AUTH', 'me_empty_token', {})
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHENTICATED' },
        { status: 401 },
      )
    }

    // ─── Verify access token ───────────────────────────────
    const payload = await verifyAccessToken(accessToken)
    if (!payload) {
      logWarn('AUTH', 'me_invalid_token', {})
      return NextResponse.json(
        { error: 'Invalid or expired session', code: 'INVALID_SESSION' },
        { status: 401 },
      )
    }

    // ─── Fetch user from DB (fresh data) ───────────────────
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        timezone: true,
        locale: true,
      },
    })

    if (!user) {
      logWarn('AUTH', 'me_user_not_found', { userId: payload.userId })
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 401 },
      )
    }

    // ─── Fetch workspaces ──────────────────────────────────
    const memberships = await db.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            isActive: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })

    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      plan: m.workspace.plan,
      role: m.role,
      isActive: m.workspace.isActive,
    }))

    logOk('AUTH', 'me_success', { userId: user.id })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        timezone: user.timezone,
        locale: user.locale,
      },
      workspaces,
    })
  } catch (err) {
    logError('AUTH', 'me_unexpected_error', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
