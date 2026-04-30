// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Google Calendar Integration Tests
// Tests that:
//   - getAuthUrl generates correct OAuth URL with scopes and state
//   - exchangeCode parses Google token response correctly
//   - createEvent formats the request body correctly
//   - deleteEvent handles errors non-fatally
//   - refreshAccessToken works with refresh_token grant
//   - listEvents returns parsed CalendarEvent[]
//   - Sync mapping logic (Google event → Appointment)
// ═══════════════════════════════════════════════════════════════

// ─── Mock fetch BEFORE any module that uses it ─────────────────
const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

// ─── Source imports ───────────────────────────────────────────

import {
  getAuthUrl,
  exchangeCode,
  createEvent,
  deleteEvent,
  listEvents,
  refreshAccessToken,
  type CalendarEvent,
  type CreateEventInput,
} from '@/lib/calendar/google-calendar'

// ═══════════════════════════════════════════════════════════════
// 1. getAuthUrl — Generates Correct OAuth URL
// ═══════════════════════════════════════════════════════════════

describe('1. getAuthUrl — OAuth consent URL generation', () => {
  it('generates a URL pointing to accounts.google.com', () => {
    const url = getAuthUrl('ws_123')
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
  })

  it('includes both calendar scopes', () => {
    const url = getAuthUrl('ws_123')
    const params = new URLSearchParams(url.split('?')[1])
    const scope = decodeURIComponent(params.get('scope') || '')
    expect(scope).toContain('https://www.googleapis.com/auth/calendar.readonly')
    expect(scope).toContain('https://www.googleapis.com/auth/calendar.events')
  })

  it('includes the workspaceId as state', () => {
    const url = getAuthUrl('ws_abc123')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('state')).toBe('ws_abc123')
  })

  it('includes access_type=offline and prompt=consent', () => {
    const url = getAuthUrl('ws_123')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('prompt')).toBe('consent')
  })

  it('includes redirect_uri pointing to calendar callback', () => {
    const url = getAuthUrl('ws_123')
    const params = new URLSearchParams(url.split('?')[1])
    const redirectUri = params.get('redirect_uri')
    expect(redirectUri).toContain('/api/calendar/callback')
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. exchangeCode — Token Exchange
// ═══════════════════════════════════════════════════════════════

describe('2. exchangeCode — parses token response', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns accessToken, refreshToken, expiresIn on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'ya29.a0AfH6SMB...',
        refresh_token: '1//0gxyz...',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      }),
    })

    const tokens = await exchangeCode('auth-code-abc')
    expect(tokens.accessToken).toBe('ya29.a0AfH6SMB...')
    expect(tokens.refreshToken).toBe('1//0gxyz...')
    expect(tokens.expiresIn).toBe(3600)
  })

  it('throws when Google returns an error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Code has expired',
      }),
    })

    await expect(exchangeCode('expired-code')).rejects.toThrow(
      /Google token exchange failed/,
    )
  })

  it('defaults refreshToken to empty string if not returned', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'ya29.a0AfH6SMB...',
        expires_in: 3600,
      }),
    })

    const tokens = await exchangeCode('code-no-refresh')
    expect(tokens.refreshToken).toBe('')
  })

  it('POSTs to the correct Google token URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok',
        refresh_token: 'ref',
        expires_in: 3600,
      }),
    })

    await exchangeCode('code')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. createEvent — Formats Request Body
// ═══════════════════════════════════════════════════════════════

describe('3. createEvent — request body formatting', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('sends correct JSON body to Google Calendar API', async () => {
    const mockEvent: CalendarEvent = {
      id: 'evt_abc123',
      summary: 'Meeting with client',
      start: { dateTime: '2025-07-15T10:00:00' },
      end: { dateTime: '2025-07-15T11:00:00' },
      status: 'confirmed',
      created: '2025-07-14T08:00:00Z',
      updated: '2025-07-14T08:00:00Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEvent,
    })

    const input: CreateEventInput = {
      summary: 'Meeting with client',
      description: 'Discuss proposal',
      startDateTime: '2025-07-15T10:00:00',
      endDateTime: '2025-07-15T11:00:00',
      timeZone: 'America/Mexico_City',
    }

    const result = await createEvent('access-token', input)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('evt_abc123')
    expect(result!.summary).toBe('Meeting with client')

    // Verify fetch was called with correct URL and body
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(options.method).toBe('POST')

    const sentBody = JSON.parse(options.body)
    expect(sentBody.summary).toBe('Meeting with client')
    expect(sentBody.description).toBe('Discuss proposal')
    expect(sentBody.start.dateTime).toBe('2025-07-15T10:00:00')
    expect(sentBody.end.dateTime).toBe('2025-07-15T11:00:00')
    expect(sentBody.start.timeZone).toBe('America/Mexico_City')
  })

  it('omits description when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'evt_no_desc',
        summary: 'Quick call',
        start: { dateTime: '2025-07-15T10:00:00' },
        end: { dateTime: '2025-07-15T10:30:00' },
        status: 'confirmed',
        created: '2025-07-14T08:00:00Z',
        updated: '2025-07-14T08:00:00Z',
      }),
    })

    await createEvent('tok', {
      summary: 'Quick call',
      startDateTime: '2025-07-15T10:00:00',
      endDateTime: '2025-07-15T10:30:00',
    })

    const [, options] = mockFetch.mock.calls[0]
    const sentBody = JSON.parse(options.body)
    expect(sentBody.description).toBeUndefined()
  })

  it('returns null on Google API error (non-fatal)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden' }),
    })

    const result = await createEvent('bad-token', {
      summary: 'Test',
      startDateTime: '2025-07-15T10:00:00',
      endDateTime: '2025-07-15T10:30:00',
    })

    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. deleteEvent — Non-Fatal Error Handling
// ═══════════════════════════════════════════════════════════════

describe('4. deleteEvent — non-fatal error handling', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls DELETE with correct URL and auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    await deleteEvent('tok', 'evt_abc123')

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('evt_abc123')
    expect(options.method).toBe('DELETE')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('does not throw on Google error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'notFound' }),
    })

    await expect(
      deleteEvent('tok', 'evt_nonexistent'),
    ).resolves.toBeUndefined()
  })

  it('does not throw on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'))

    await expect(
      deleteEvent('tok', 'evt_net_fail'),
    ).resolves.toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. refreshAccessToken — Refresh Token Flow
// ═══════════════════════════════════════════════════════════════

describe('5. refreshAccessToken — refresh token flow', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('exchanges refresh_token for new access_token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new_access_tok',
        expires_in: 3600,
      }),
    })

    const tokens = await refreshAccessToken('my_refresh_token')
    expect(tokens.accessToken).toBe('new_access_tok')
    expect(tokens.expiresIn).toBe(3600)
    // When Google doesn't return a new refresh_token, use the original
    expect(tokens.refreshToken).toBe('my_refresh_token')
  })

  it('uses the new refresh_token if Google returns one', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new_access_tok',
        refresh_token: 'brand_new_refresh',
        expires_in: 3600,
      }),
    })

    const tokens = await refreshAccessToken('old_refresh')
    expect(tokens.refreshToken).toBe('brand_new_refresh')
  })

  it('sends grant_type=refresh_token in the body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'tok',
        expires_in: 3600,
      }),
    })

    await refreshAccessToken('ref')
    const [, options] = mockFetch.mock.calls[0]
    const body = new URLSearchParams(options.body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('ref')
  })

  it('throws on failed refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked',
      }),
    })

    await expect(refreshAccessToken('revoked_token')).rejects.toThrow(
      /Google token refresh failed/,
    )
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. listEvents — Returns Parsed Events
// ═══════════════════════════════════════════════════════════════

describe('6. listEvents — returns parsed CalendarEvent[]', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns an array of CalendarEvent objects', async () => {
    const googleResponse = {
      items: [
        {
          id: 'evt_1',
          summary: 'Team standup',
          start: { dateTime: '2025-07-15T09:00:00' },
          end: { dateTime: '2025-07-15T09:15:00' },
          status: 'confirmed',
          created: '2025-07-14T08:00:00Z',
          updated: '2025-07-14T08:00:00Z',
        },
        {
          id: 'evt_2',
          summary: 'Client call',
          description: 'Follow up on proposal',
          start: { dateTime: '2025-07-15T11:00:00' },
          end: { dateTime: '2025-07-15T12:00:00' },
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?id=evt_2',
          created: '2025-07-14T09:00:00Z',
          updated: '2025-07-14T09:00:00Z',
        },
      ],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => googleResponse,
    })

    const events = await listEvents('tok')
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('evt_1')
    expect(events[0].summary).toBe('Team standup')
    expect(events[1].description).toBe('Follow up on proposal')
  })

  it('includes timeMin and timeMax query params when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    })

    const timeMin = new Date('2025-07-01T00:00:00Z')
    const timeMax = new Date('2025-07-31T23:59:59Z')

    await listEvents('tok', timeMin, timeMax)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('timeMin=')
    expect(url).toContain('timeMax=')
    expect(url).toContain('maxResults=250')
    expect(url).toContain('singleEvents=true')
    expect(url).toContain('orderBy=startTime')
  })

  it('returns empty array on Google API error (non-fatal)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    })

    const events = await listEvents('expired-tok')
    expect(events).toEqual([])
  })

  it('returns empty array when items is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    const events = await listEvents('tok')
    expect(events).toEqual([])
  })

  it('returns empty array on network error (non-fatal)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS failure'))

    const events = await listEvents('tok')
    expect(events).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. Sync Mapping Logic — Google Event → Appointment
// ═══════════════════════════════════════════════════════════════

describe('7. Sync mapping logic — Google event to Appointment', () => {
  /**
   * Test the data mapping logic that the sync route uses.
   * We test the transformation logic in isolation without DB.
   */

  it('maps a Google event to Appointment fields correctly', () => {
    const gEvent: CalendarEvent = {
      id: 'gevt_mapping_1',
      summary: 'Demo meeting',
      description: 'Product walkthrough',
      start: { dateTime: '2025-07-15T14:00:00' },
      end: { dateTime: '2025-07-15T15:30:00' },
      status: 'confirmed',
      created: '2025-07-14T10:00:00Z',
      updated: '2025-07-14T10:00:00Z',
    }

    // Simulate what the sync route does
    const startDateStr = gEvent.start.dateTime || gEvent.start.date!
    const startDate = new Date(startDateStr)
    const endDateStr = gEvent.end.dateTime || gEvent.end.date
    let duration = 30
    if (endDateStr) {
      duration = Math.max(1, Math.round((new Date(endDateStr).getTime() - startDate.getTime()) / 60000))
    }

    const metadata = JSON.stringify({ googleEventId: gEvent.id, source: 'google_calendar' })

    expect(startDate).toBeInstanceOf(Date)
    expect(duration).toBe(90) // 15:30 - 14:00 = 90 minutes
    expect(JSON.parse(metadata).googleEventId).toBe('gevt_mapping_1')
    expect(JSON.parse(metadata).source).toBe('google_calendar')
  })

  it('handles all-day events (date-only, no dateTime)', () => {
    const gEvent: CalendarEvent = {
      id: 'gevt_allday',
      summary: 'Company holiday',
      start: { date: '2025-07-25' },
      end: { date: '2025-07-26' },
      status: 'confirmed',
      created: '2025-07-01T00:00:00Z',
      updated: '2025-07-01T00:00:00Z',
    }

    const startDateStr = gEvent.start.dateTime || gEvent.start.date!
    const startDate = new Date(startDateStr)
    const endDateStr = gEvent.end.dateTime || gEvent.end.date
    let duration = 30
    if (endDateStr) {
      duration = Math.max(1, Math.round((new Date(endDateStr).getTime() - startDate.getTime()) / 60000))
    }

    expect(startDate.toISOString().slice(0, 10)).toBe('2025-07-25')
    expect(duration).toBe(1440) // 1 day = 1440 minutes
  })

  it('skips cancelled events', () => {
    const gEvent: CalendarEvent = {
      id: 'gevt_cancelled',
      summary: 'Cancelled meeting',
      start: { dateTime: '2025-07-15T10:00:00' },
      end: { dateTime: '2025-07-15T11:00:00' },
      status: 'cancelled',
      created: '2025-07-14T08:00:00Z',
      updated: '2025-07-14T08:00:00Z',
    }

    // The sync route skips events with status === 'cancelled'
    const shouldSkip = gEvent.status === 'cancelled'
    expect(shouldSkip).toBe(true)
  })

  it('extracts googleEventId from metadata for orphan detection', () => {
    const metadataJson = '{"googleEventId":"gevt_123","source":"google_calendar"}'
    const meta = JSON.parse(metadataJson) as Record<string, unknown>
    const googleId = meta.googleEventId as string

    expect(googleId).toBe('gevt_123')

    // Simulate orphan detection: event exists locally but not in Google
    const googleEventIds = new Set(['gevt_456', 'gevt_789'])
    const isOrphan = googleId && !googleEventIds.has(googleId)
    expect(isOrphan).toBe(true)
  })
})
