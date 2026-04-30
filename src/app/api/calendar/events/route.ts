// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — POST /api/calendar/events
// Creates an event in BOTH the local Appointment table AND
// Google Calendar (if connected for the workspace).
//
// Input:  { workspaceId, title, date, duration, description?, contactId? }
// Output: the created Appointment record
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { logError, logOk } from '@/lib/logger'
import {
  createEvent,
  refreshAccessToken,
  type StoredCalendarTokens,
} from '@/lib/calendar/google-calendar'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, title, date, duration, description, contactId } = body as {
      workspaceId?: string
      title?: string
      date?: string
      duration?: number
      description?: string
      contactId?: string
    }

    if (!workspaceId || !title || !date) {
      return Response.json(
        { error: 'Campos requeridos: workspaceId, title, date' },
        { status: 400 },
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    const eventDate = new Date(date)
    const eventDuration = duration || 30

    // Calculate end time
    const endDate = new Date(eventDate.getTime() + eventDuration * 60_000)

    // ── 1. Create local Appointment ──────────────────────────
    const appointment = await db.appointment.create({
      data: {
        workspaceId,
        contactId: contactId || null,
        title,
        description: description || null,
        date: eventDate,
        duration: eventDuration,
        type: 'meeting',
        status: 'pending',
        metadata: '{}',
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    })

    // ── 2. Also create in Google Calendar if connected ───────
    try {
      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { settings: true },
      })

      if (workspace) {
        let settings: Record<string, unknown> = {}
        try {
          settings = JSON.parse(workspace.settings) as Record<string, unknown>
        } catch {
          // proceed without Google sync
        }

        const calendarTokens = settings.googleCalendar as StoredCalendarTokens | undefined

        if (calendarTokens?.accessToken && calendarTokens?.refreshToken) {
          let accessToken = calendarTokens.accessToken

          // Refresh if expired
          if (Date.now() >= calendarTokens.expiresAt) {
            const newTokens = await refreshAccessToken(calendarTokens.refreshToken)
            accessToken = newTokens.accessToken

            // Persist refreshed tokens
            const updatedSettings = {
              ...settings,
              googleCalendar: {
                accessToken: newTokens.accessToken,
                refreshToken: newTokens.refreshToken,
                expiresAt: Date.now() + newTokens.expiresIn * 1000,
              },
            }
            await db.workspace.update({
              where: { id: workspaceId },
              data: { settings: JSON.stringify(updatedSettings) },
            })
          }

          // Create in Google
          const googleEvent = await createEvent(accessToken, {
            summary: title,
            description: description || undefined,
            startDateTime: eventDate.toISOString(),
            endDateTime: endDate.toISOString(),
          })

          // If Google creation succeeded, store the googleEventId
          if (googleEvent) {
            await db.appointment.update({
              where: { id: appointment.id },
              data: {
                metadata: JSON.stringify({
                  googleEventId: googleEvent.id,
                  source: 'local_with_google',
                }),
              },
            })

            // Update the returned object for the response
            ;(appointment as Record<string, unknown>).metadata = JSON.stringify({
              googleEventId: googleEvent.id,
              source: 'local_with_google',
            })
          }
        }
      }
    } catch (err) {
      // Google Calendar creation is best-effort — never fail the whole request
      logError('CORE', 'calendar/events', err, { appointmentId: appointment.id })
    }

    logOk('CORE', 'calendar/events', { appointmentId: appointment.id })

    return Response.json({ success: true, appointment }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
