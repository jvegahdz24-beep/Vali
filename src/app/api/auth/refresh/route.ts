// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Token Refresh Endpoint
// POST /api/auth/refresh
// Body: { refreshToken: string }
// Response: { accessToken, refreshToken, expiresIn } | 401
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { verifyRefreshToken, rotateRefreshToken, createAccessToken } from '@/lib/auth'
import { db } from '@/lib/db'
import { logError, logInfo } from '@/lib/logger'

export async function POST(req: NextRequest) {
  try {
    // Try cookie first, then body
    const refreshTokenFromCookie = req.cookies.get('valiflow-refresh')?.value
    let refreshToken = refreshTokenFromCookie

    if (!refreshToken) {
      try {
        const body = await req.json()
        refreshToken = body.refreshToken
      } catch {
        // No body
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token requerido' },
        { status: 401 },
      )
    }

    // Verify refresh token
    const userId = await verifyRefreshToken(refreshToken)
    if (!userId) {
      return NextResponse.json(
        { error: 'Refresh token invalido o expirado' },
        { status: 401 },
      )
    }

    // Get user from DB
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 401 },
      )
    }

    // Rotate refresh token
    const newRefreshData = await rotateRefreshToken(refreshToken, userId)
    if (!newRefreshData) {
      return NextResponse.json(
        { error: 'Error al rotar refresh token' },
        { status: 401 },
      )
    }

    // Create new access token
    const accessToken = await createAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
    })

    // Get active workspace
    const activeMembership = await db.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: 'asc' },
    })

    logInfo('AUTH', 'token_refreshed', { userId: user.id })

    const response = NextResponse.json({
      accessToken,
      refreshToken: newRefreshData.token,
      expiresIn: 15 * 60, // 15 minutes
    })

    // Set cookies
    response.cookies.set('valiflow-session', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    })

    response.cookies.set('valiflow-refresh', newRefreshData.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: 7 * 24 * 3600, // 7 days
    })

    return response
  } catch (err) {
    logError('AUTH', 'refresh_error', err)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    )
  }
}
