// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — "Add to calendar" link builders
// Pure URL construction — NO external API, NO OAuth. The appointment
// date is a real UTC instant; we emit UTC (…Z) timestamps so Google /
// Outlook render the event in the viewer's own local time.
// ═══════════════════════════════════════════════════════════════

export interface CalendarEventInput {
  title: string
  start: Date
  durationMin: number
  details?: string
  location?: string
}

// YYYYMMDDTHHMMSSZ (UTC basic format expected by Google/Outlook)
function fmtUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function googleCalendarLink(e: CalendarEventInput): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmtUtc(e.start)}/${fmtUtc(end)}`,
  })
  if (e.details) p.set('details', e.details)
  if (e.location) p.set('location', e.location)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function outlookCalendarLink(e: CalendarEventInput): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000)
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: end.toISOString(),
  })
  if (e.details) p.set('body', e.details)
  if (e.location) p.set('location', e.location)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`
}

/** A raw .ics document (RFC 5545) — for email attachments or an endpoint. */
export function buildICS(e: CalendarEventInput & { uid: string }): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000)
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ValiAutoFlow//ES',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTART:${fmtUtc(e.start)}`,
    `DTEND:${fmtUtc(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.details ? `DESCRIPTION:${esc(e.details)}` : '',
    e.location ? `LOCATION:${esc(e.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}
