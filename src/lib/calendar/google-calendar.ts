// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Google Calendar API Wrapper
// Handles OAuth2 consent, token exchange, event CRUD, and
// refresh-token management for workspace-level integration.
// ═══════════════════════════════════════════════════════════════

import { logError, logInfo, logOk, logWarn } from '@/lib/logger'

// ─── Configuration ──────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/calendar/callback`

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/** Scopes needed for read/write calendar access */
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

// ─── Types ──────────────────────────────────────────────────

/** Token set returned by Google OAuth2 token endpoint */
export interface GoogleTokenSet {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/** A parsed Google Calendar event */
export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  htmlLink?: string
  status: string
  created: string
  updated: string
}

/** Input for creating a new calendar event */
export interface CreateEventInput {
  summary: string
  description?: string
  startDateTime: string // ISO 8601
  endDateTime: string   // ISO 8601
  timeZone?: string
}

/** Stored token data shape in workspace settings */
export interface StoredCalendarTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Generate the Google OAuth2 consent URL for calendar access.
 * The `workspaceId` is passed as `state` so it can be recovered
 * on the callback.
 */
export function getAuthUrl(workspaceId: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: CALENDAR_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: workspaceId,
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * @throws Error if the Google token endpoint returns an error.
 */
export async function exchangeCode(code: string): Promise<GoogleTokenSet> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const msg = (errorBody as Record<string, string>).error_description
      || (errorBody as Record<string, string>).error
      || `HTTP ${response.status}`
    logError('CORE', 'exchangeCode', new Error(msg), { code: code.slice(0, 8) + '…' })
    throw new Error(`Google token exchange failed: ${msg}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: data.expires_in,
  }
}

/**
 * Use a refresh_token to obtain a new access_token.
 * @throws Error if the refresh attempt fails.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const msg = (errorBody as Record<string, string>).error_description
      || (errorBody as Record<string, string>).error
      || `HTTP ${response.status}`
    logError('CORE', 'refreshAccessToken', new Error(msg))
    throw new Error(`Google token refresh failed: ${msg}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  }
}

/**
 * List events from the user's primary Google Calendar.
 * Returns an empty array on any Google API error (non-fatal).
 */
export async function listEvents(
  accessToken: string,
  timeMin?: Date,
  timeMax?: Date,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: '250',
    singleEvents: 'true',
    orderBy: 'startTime',
  })

  if (timeMin) {
    params.set('timeMin', timeMin.toISOString())
  }
  if (timeMax) {
    params.set('timeMax', timeMax.toISOString())
  }

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      logWarn('CORE', 'listEvents', {
        status: response.status,
        error: (errorBody as Record<string, string>).error || 'unknown',
      })
      return []
    }

    const data = await response.json() as { items?: CalendarEvent[] }
    return data.items || []
  } catch (err) {
    logError('CORE', 'listEvents', err)
    return []
  }
}

/**
 * Create an event in the user's primary Google Calendar.
 * Returns the created event or `null` on error (non-fatal).
 */
export async function createEvent(
  accessToken: string,
  event: CreateEventInput,
): Promise<CalendarEvent | null> {
  const body: Record<string, unknown> = {
    summary: event.summary,
    start: {
      dateTime: event.startDateTime,
      timeZone: event.timeZone || 'America/Mexico_City',
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: event.timeZone || 'America/Mexico_City',
    },
  }

  if (event.description) {
    body.description = event.description
  }

  try {
    const response = await fetch(GOOGLE_CALENDAR_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      logError('CORE', 'createEvent', new Error('Google create failed'), {
        status: response.status,
        error: (errorBody as Record<string, string>).error || 'unknown',
      })
      return null
    }

    const created = await response.json() as CalendarEvent
    logOk('CORE', 'createEvent', { eventId: created.id })
    return created
  } catch (err) {
    logError('CORE', 'createEvent', err)
    return null
  }
}

/**
 * Delete an event from the user's primary Google Calendar.
 * Non-fatal: logs on error, never throws.
 */
export async function deleteEvent(
  accessToken: string,
  eventId: string,
): Promise<void> {
  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API}/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok && response.status !== 204) {
      const errorBody = await response.json().catch(() => ({}))
      logWarn('CORE', 'deleteEvent', {
        status: response.status,
        error: (errorBody as Record<string, string>).error || 'unknown',
        eventId,
      })
    } else {
      logOk('CORE', 'deleteEvent', { eventId })
    }
  } catch (err) {
    logError('CORE', 'deleteEvent', err, { eventId })
  }
}
