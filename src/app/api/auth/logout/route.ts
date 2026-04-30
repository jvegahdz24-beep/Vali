// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Logout API Endpoint
// POST /api/auth/logout — Clear session cookie
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth-edge'

export async function POST() {
  try {
    const response = NextResponse.json({ success: true })

    // Clear the session cookie
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: false, // Behind Caddy reverse proxy (SSL terminated at proxy level)
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Logout Error]', error)
    // Even if something goes wrong, still clear the cookie
    const response = NextResponse.json({ success: true })
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    return response
  }
}
