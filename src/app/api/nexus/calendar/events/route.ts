import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// Helper: refresh Google access token
async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.access_token || null
}

// GET /api/nexus/calendar/events — Fetch upcoming Google Calendar events (next 7 days)
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    let profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
    })

    if (!profile || !profile.googleCalendarConnected) {
      return Response.json({ events: [], connected: false })
    }

    let accessToken = profile.googleCalendarToken

    // Try to fetch events, refresh token if needed
    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=10`

    let res = await fetch(calendarUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // If 401, try to refresh token
    if (res.status === 401 && profile.googleCalendarRefreshToken) {
      const newToken = await refreshGoogleToken(profile.googleCalendarRefreshToken)
      if (newToken) {
        accessToken = newToken
        await db.nexusProfile.update({
          where: { userId: session.userId },
          data: { googleCalendarToken: newToken },
        })
        res = await fetch(calendarUrl, {
          headers: { Authorization: `Bearer ${newToken}` },
        })
      }
    }

    if (!res.ok) {
      return Response.json({ events: [], connected: false, error: 'Failed to fetch events' })
    }

    const data = await res.json()

    const events = (data.items || []).map((item: Record<string, unknown>) => ({
      id: item.id,
      title: item.summary || 'Sin título',
      start: (item.start as Record<string, unknown>)?.dateTime || (item.start as Record<string, unknown>)?.date || '',
      end: (item.end as Record<string, unknown>)?.dateTime || (item.end as Record<string, unknown>)?.date || '',
      description: item.description || undefined,
      link: item.htmlLink || undefined,
    }))

    return Response.json({ events, connected: true })
  } catch (error) {
    return errorResponse(error)
  }
}
