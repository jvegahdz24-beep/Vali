// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Logout API Endpoint
// POST /api/auth/logout — Clear session cookies, revoke tokens
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { logInfo, logOk, logError } from '@/lib/logger'
import {
  verifyAccessToken,
  revokeSession,
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─── Cookie Helpers ───────────────────────────────────────────

const clearCookie = (name: string) => ({
  name,
  value: '',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 0,
})

// ─── Route Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  logInfo('AUTH', 'logout_start', {})

  try {
    // Best-effort: try to extract tokens and revoke in Redis
    // Even if this fails, we still clear cookies on the response
    const accessToken = req.cookies.get(SESSION_COOKIE_NAME)?.value

    if (accessToken) {
      try {
        const payload = await verifyAccessToken(accessToken)
        if (payload) {
          await revokeSession(accessToken, payload.userId)
          logInfo('AUTH', 'logout_revoked_session', { userId: payload.userId })
        }
      } catch {
        // Token might be malformed or already expired — that's fine
        logError('AUTH', 'logout_revoke_failed', null)
      }
    }

    // ─── Build response with cleared cookies ────────────────
    const response = NextResponse.json({ success: true })

    // Clear access token cookie
    response.cookies.set(
      clearCookie(SESSION_COOKIE_NAME).name,
      clearCookie(SESSION_COOKIE_NAME).value,
      clearCookie(SESSION_COOKIE_NAME),
    )

    // Clear refresh token cookie
    response.cookies.set(
      clearCookie(REFRESH_COOKIE_NAME).name,
      clearCookie(REFRESH_COOKIE_NAME).value,
      clearCookie(REFRESH_COOKIE_NAME),
    )

    logOk('AUTH', 'logout_success', {})

    return response
  } catch (err) {
    logError('AUTH', 'logout_unexpected_error', err)

    // Even on error, always clear cookies
    const response = NextResponse.json({ success: true })
    response.cookies.set(
      clearCookie(SESSION_COOKIE_NAME).name,
      clearCookie(SESSION_COOKIE_NAME).value,
      clearCookie(SESSION_COOKIE_NAME),
    )
    response.cookies.set(
      clearCookie(REFRESH_COOKIE_NAME).name,
      clearCookie(REFRESH_COOKIE_NAME).value,
      clearCookie(REFRESH_COOKIE_NAME),
    )

    return response
  }
}
