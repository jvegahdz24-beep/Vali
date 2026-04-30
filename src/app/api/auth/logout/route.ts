// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Logout API Endpoint
// POST /api/auth/logout — Clear session cookie
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth'

export async function POST() {
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
}
