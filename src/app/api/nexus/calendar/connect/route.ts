import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

// GET /api/nexus/calendar/connect — Get Google OAuth URL for Calendar
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      return Response.json(
        { error: 'Configura las credenciales de Google en .env' },
        { status: 400 }
      )
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/nexus/calendar/callback`
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' ')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state: session.userId,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return Response.json({ url: authUrl })
  } catch (error) {
    return errorResponse(error)
  }
}
