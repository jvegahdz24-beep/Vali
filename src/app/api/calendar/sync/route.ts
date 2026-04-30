// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — POST /api/calendar/sync
// Syncs Google Calendar events (next 30 days) into the local
// Appointment table. Handles token refresh if expired.
//
// Logic:
//   1. Read stored tokens from workspace settings
//   2. Refresh if expired
//   3. Fetch Google events for next 30 days
//   4. Upsert into Appointment table (match by googleEventId in metadata)
//   5. Mark locally-tracked Google events as cancelled if missing from Google
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { logError, logOk, logWarn } from '@/lib/logger'
import {
  listEvents,
  refreshAccessToken,
  type StoredCalendarTokens,
} from '@/lib/calendar/google-calendar'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      throw new ApiError(400, 'workspaceId es requerido')
    }

    await requireWorkspace(workspaceId, session.userId)

    // ── 1. Read stored tokens ────────────────────────────────
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })

    if (!workspace) {
      throw new ApiError(404, 'Workspace no encontrado')
    }

    let settings: Record<string, unknown> = {}
    try {
      settings = JSON.parse(workspace.settings) as Record<string, unknown>
    } catch {
      // proceed with empty
    }

    const calendarTokens = settings.googleCalendar as StoredCalendarTokens | undefined
    if (!calendarTokens?.accessToken || !calendarTokens?.refreshToken) {
      throw new ApiError(400, 'Google Calendar no está conectado. Conecta tu cuenta primero.')
    }

    // ── 2. Refresh token if expired ──────────────────────────
    // FIX MEDIUM: Add 5-minute buffer to prevent edge-case failures at exact expiry
    let accessToken = calendarTokens.accessToken
    const TOKEN_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

    if (Date.now() >= calendarTokens.expiresAt - TOKEN_BUFFER_MS) {
      logWarn('CORE', 'calendar/sync', { message: 'Token expired, refreshing…', workspaceId })
      try {
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
      } catch (err) {
        logError('CORE', 'calendar/sync', err, { workspaceId })
        throw new ApiError(401, 'No se pudo renovar el token de Google Calendar. Reconecta tu cuenta.')
      }
    }

    // ── 3. Fetch Google events (next 30 days) ───────────────
    const now = new Date()
    const future = new Date()
    future.setDate(future.getDate() + 30)

    const googleEvents = await listEvents(accessToken, now, future)

    // ── 4. Upsert into Appointment table ─────────────────────
    let created = 0
    let updated = 0

    for (const gEvent of googleEvents) {
      // Skip cancelled Google events
      if (gEvent.status === 'cancelled') continue

      // Parse start date/time
      const startDateStr = gEvent.start.dateTime || gEvent.start.date
      if (!startDateStr) continue

      const startDate = new Date(startDateStr)

      // Calculate duration from end time
      const endDateStr = gEvent.end.dateTime || gEvent.end.date
      let duration = 30 // default 30 min
      if (endDateStr) {
        duration = Math.max(1, Math.round((new Date(endDateStr).getTime() - startDate.getTime()) / 60000))
      }

      // Check if appointment already exists (by googleEventId in metadata)
      const existing = await db.appointment.findFirst({
        where: {
          workspaceId,
          metadata: { contains: gEvent.id },
        },
      })

      const metadata = JSON.stringify({ googleEventId: gEvent.id, source: 'google_calendar' })

      if (existing) {
        // Update if data changed
        await db.appointment.update({
          where: { id: existing.id },
          data: {
            title: gEvent.summary || 'Sin título',
            description: gEvent.description || null,
            date: startDate,
            duration,
            status: existing.status === 'cancelled' ? 'pending' : existing.status,
            metadata,
          },
        })
        updated++
      } else {
        // Create new appointment
        await db.appointment.create({
          data: {
            workspaceId,
            title: gEvent.summary || 'Sin título',
            description: gEvent.description || null,
            date: startDate,
            duration,
            type: 'meeting',
            status: 'pending',
            metadata,
          },
        })
        created++
      }
    }

    // ── 5. Cancel local appointments whose Google events are gone ──
    const googleEventIds = new Set(googleEvents.map((e) => e.id))

    // Find all locally-tracked Google appointments in the next 30 days
    const localGoogleAppointments = await db.appointment.findMany({
      where: {
        workspaceId,
        date: { gte: now, lte: future },
        status: { not: 'cancelled' },
      },
    })

    let cancelled = 0
    for (const apt of localGoogleAppointments) {
      let meta: Record<string, unknown> = {}
      try {
        meta = JSON.parse(apt.metadata) as Record<string, unknown>
      } catch {
        // not JSON — skip
        continue
      }

      const googleId = meta.googleEventId as string | undefined
      if (googleId && !googleEventIds.has(googleId)) {
        await db.appointment.update({
          where: { id: apt.id },
          data: { status: 'cancelled' },
        })
        cancelled++
      }
    }

    logOk('CORE', 'calendar/sync', {
      workspaceId,
      googleEvents: googleEvents.length,
      created,
      updated,
      cancelled,
    })

    return Response.json({
      success: true,
      synced: created + updated,
      created,
      updated,
      cancelled,
      totalGoogleEvents: googleEvents.length,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
