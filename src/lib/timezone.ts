// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Timezone helpers (per-workspace)
//
// Appointments are stored as real UTC instants. Each workspace has a
// configured business timezone (settings.timezone) that anchors:
//   • how the AI's "11:00" wall-clock is converted to a UTC instant
//   • how the calendar renders that instant back to a wall-clock
// so the agreed time always matches for everyone, regardless of the
// server's timezone or the viewer's device.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

// Default kept as Mexico City to preserve prior behavior for existing
// tenants; Mexico has no DST since 2022, but this works for any IANA zone.
export const DEFAULT_TIMEZONE = 'America/Mexico_City'

/** Read the business timezone from a workspace.settings JSON string. */
export function tzFromSettings(settingsJson: string | null | undefined): string {
  try {
    const s = JSON.parse(settingsJson || '{}') as Record<string, unknown>
    if (typeof s.timezone === 'string' && s.timezone.trim()) return s.timezone.trim()
  } catch { /* ignore */ }
  return DEFAULT_TIMEZONE
}

/** Fetch a workspace's configured timezone (defaults to DEFAULT_TIMEZONE). */
export async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  try {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    return tzFromSettings(ws?.settings)
  } catch {
    return DEFAULT_TIMEZONE
  }
}

/**
 * Offset (ms) of `tz` relative to UTC at the given instant.
 * e.g. America/Mexico_City → -21600000 (UTC-6). DST-aware via Intl.
 */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value
  // Intl returns hour "24" at midnight in some envs — normalize.
  const hour = map.hour === '24' ? '00' : map.hour
  const asIfUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +hour, +map.minute, +map.second)
  return asIfUtc - date.getTime()
}

/**
 * Break an instant into its wall-clock parts (year/month/day/hour) as seen
 * in `tz`. Used by the quiet-hours gate to know the local hour of a send.
 */
export function localParts(date: Date, tz: string): { year: number; month: number; day: number; hour: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value
  const hour = m.hour === '24' ? '00' : m.hour
  return { year: +m.year, month: +m.month, day: +m.day, hour: +hour }
}

/**
 * Convert a naive wall-clock string ("YYYY-MM-DDTHH:mm" or with seconds,
 * optionally space-separated) interpreted in `tz` into a real UTC Date.
 *
 * Example: zonedNaiveToUtc('2026-06-16T12:00', 'America/Cancun') → 17:00Z
 */
export function zonedNaiveToUtc(naive: string, tz: string): Date {
  const m = naive.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) {
    const fallback = new Date(naive)
    return fallback
  }
  const [, Y, Mo, D, H, Mi, S] = m
  // First approximation: treat the wall-clock as if it were UTC.
  const utcGuess = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +(S || '0'))
  // The offset of tz near that instant tells us how far to shift.
  const offset = tzOffsetMs(new Date(utcGuess), tz)
  return new Date(utcGuess - offset)
}
