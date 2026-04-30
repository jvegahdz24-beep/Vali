import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// POST /api/nexus/calendar/disconnect — Disconnect Google Calendar
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    await db.nexusProfile.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        googleCalendarConnected: false,
        googleCalendarToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarSyncEnabled: false,
      },
      update: {
        googleCalendarConnected: false,
        googleCalendarToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarSyncEnabled: false,
      },
    })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
