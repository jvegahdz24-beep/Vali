// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Google OAuth Initiation Endpoint
// GET /api/auth/google — Redirect to Google OAuth consent screen
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getGoogleAuthUrl, GOOGLE_STATE_COOKIE_NAME } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  try {
    // Guard: Check if Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('error', 'google_not_configured')
      return NextResponse.redirect(loginUrl)
    }

    // Generate a random state for CSRF protection
    const state = randomUUID()

    // Build the Google OAuth URL with the state
    const authUrl = getGoogleAuthUrl(state)

    // Redirect to Google consent screen, setting state cookie
    const response = NextResponse.redirect(authUrl)

    // Set state cookie for CSRF verification in callback
    response.cookies.set(GOOGLE_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Google OAuth Init Error]', error)
    return NextResponse.json(
      { error: 'Error al iniciar sesión con Google', code: 'OAUTH_INIT_ERROR' },
      { status: 500 }
    )
  }
}
