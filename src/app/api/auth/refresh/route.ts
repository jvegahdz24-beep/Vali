// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Token Refresh Endpoint
// POST /api/auth/refresh
// Reads refresh token from cookie, rotates it, issues new access token
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { config } from '@/lib/config'
import { logInfo, logOk, logWarn, logError } from '@/lib/logger'
import {
  createAccessToken,
  verifyRefreshToken,
  rotateRefreshToken,
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─── Cookie Helpers ───────────────────────────────────────────

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

const ACCESS_MAX_AGE = config.JWT_ACCESS_EXPIRY_SECONDS    // 900 seconds
const REFRESH_MAX_AGE = config.JWT_REFRESH_EXPIRY_SECONDS  // 604800 seconds

// ─── Route Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  logInfo('AUTH', 'refresh_start', {})

  try {
    // Read refresh token from cookie (primary) or request body (fallback)
    const refreshTokenFromCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value
    let refreshToken = refreshTokenFromCookie

    if (!refreshToken) {
      try {
        const body = await req.json()
        refreshToken = body.refreshToken
      } catch {
        // No body present — that's fine, just no token
      }
    }

    if (!refreshToken) {
      logWarn('AUTH', 'refresh_no_token', {})
      return NextResponse.json(
        { error: 'Refresh token required', code: 'MISSING_REFRESH_TOKEN' },
        { status: 401 },
      )
    }

    // ─── Verify refresh token ───────────────────────────────
    const userId = await verifyRefreshToken(refreshToken)
    if (!userId) {
      logWarn('AUTH', 'refresh_invalid_token', {})
      return NextResponse.json(
        { error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' },
        { status: 401 },
      )
    }

    // ─── Fetch user from DB ─────────────────────────────────
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      logWarn('AUTH', 'refresh_user_not_found', { userId })
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 401 },
      )
    }

    // ─── Rotate refresh token ───────────────────────────────
    const newRefreshData = await rotateRefreshToken(refreshToken, userId)
    if (!newRefreshData) {
      logWarn('AUTH', 'refresh_rotation_failed', { userId })
      return NextResponse.json(
        { error: 'Failed to rotate refresh token', code: 'ROTATION_FAILED' },
        { status: 401 },
      )
    }

    // ─── Create new access token ────────────────────────────
    const accessToken = await createAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
    })

    // ─── Build response ─────────────────────────────────────
    const response = NextResponse.json({
      accessToken,
      expiresIn: ACCESS_MAX_AGE,
    })

    // Set new access token cookie
    response.cookies.set(SESSION_COOKIE_NAME, accessToken, {
      ...cookieBase,
      maxAge: ACCESS_MAX_AGE,
    })

    // Set rotated refresh token cookie
    response.cookies.set(REFRESH_COOKIE_NAME, newRefreshData.token, {
      ...cookieBase,
      maxAge: REFRESH_MAX_AGE,
    })

    logOk('AUTH', 'refresh_success', { userId: user.id })

    return response
  } catch (err) {
    logError('AUTH', 'refresh_unexpected_error', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
