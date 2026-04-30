import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

// GET /api/nexus/calendar/callback — Handle Google OAuth callback
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // userId

    if (!code || !state) {
      return Response.redirect(new URL('/nexus-shell?view=profile&error=no_code', request.url))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/nexus/calendar/callback`

    if (!clientId || !clientSecret) {
      return Response.redirect(new URL('/nexus-shell?view=profile&error=no_credentials', request.url))
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errData = await tokenRes.json()
      console.error('Token exchange failed:', errData)
      return Response.redirect(new URL('/nexus-shell?view=profile&error=token_exchange', request.url))
    }

    const tokenData = await tokenRes.json()

    // Upsert profile and store tokens
    await db.nexusProfile.upsert({
      where: { userId: state },
      create: {
        userId: state,
        googleCalendarConnected: true,
        googleCalendarToken: tokenData.access_token,
        googleCalendarRefreshToken: tokenData.refresh_token || null,
      },
      update: {
        googleCalendarConnected: true,
        googleCalendarToken: tokenData.access_token,
        googleCalendarRefreshToken: tokenData.refresh_token || null,
      },
    })

    return Response.redirect(new URL('/nexus-shell?view=profile&calendar=connected', request.url))
  } catch (error) {
    console.error('Calendar callback error:', error)
    return Response.redirect(new URL('/nexus-shell?view=profile&error=unknown', request.url))
  }
}
