// ═══════════════════════════════════════════════════════════════
// Horario nocturno (quiet hours) para envíos automáticos.
//
// El motor de seguimiento enviaba a CUALQUIER hora en que corriera el cron
// (mensajes a la 1am se ven como spam/bot). Este módulo define una ventana
// de silencio por workspace (default 21:00–08:00 en su zona horaria) y, si
// un envío cae dentro, lo REPROGRAMA para la mañana siguiente.
//
// Fuente de verdad única: nextAllowedSend(). La usan tanto el enrolamiento
// de reactivación (para arrancar en horario válido) como el worker de envío
// (gate final que protege TODA la escalera, no solo la reactivación).
// ═══════════════════════════════════════════════════════════════

import { tzFromSettings, localParts, zonedNaiveToUtc } from '@/lib/timezone'

export interface QuietConfig { enabled: boolean; start: number; end: number }

function clampHour(v: unknown, def: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : def
}

/** Lee la ventana de silencio del workspace (default ON, 21:00–08:00). */
export function quietConfig(wsSettings: Record<string, unknown>): QuietConfig {
  return {
    enabled: wsSettings.quietHoursEnabled !== false, // default activado
    start: clampHour(wsSettings.quietHoursStart, 21),
    end: clampHour(wsSettings.quietHoursEnd, 8),
  }
}

/** ¿La hora local `h` cae dentro de la ventana de silencio [start..end)? */
function isQuietHour(h: number, cfg: QuietConfig): boolean {
  // Ventana que cruza medianoche (ej. 21→8): silencio si h>=start O h<end.
  if (cfg.start > cfg.end) return h >= cfg.start || h < cfg.end
  // Ventana intradía (ej. 13→15, raro): silencio si start<=h<end.
  return h >= cfg.start && h < cfg.end
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Devuelve el instante en que SÍ se puede enviar. Si `date` no cae en horario
 * nocturno, lo devuelve tal cual. Si cae de noche, devuelve la próxima hora
 * `end` (mañana) en la zona horaria del negocio.
 */
export function nextAllowedSend(date: Date, wsSettings: Record<string, unknown>): Date {
  const cfg = quietConfig(wsSettings)
  if (!cfg.enabled) return date
  const tz = tzFromSettings(JSON.stringify(wsSettings))
  const ln = localParts(date, tz)
  if (!isQuietHour(ln.hour, cfg)) return date
  // Si es madrugada (antes de `end`), abre hoy; si es de noche, abre mañana.
  const base = ln.hour < cfg.end ? date : new Date(date.getTime() + 24 * 60 * 60 * 1000)
  const b = localParts(base, tz)
  return zonedNaiveToUtc(`${b.year}-${pad(b.month)}-${pad(b.day)}T${pad(cfg.end)}:00`, tz)
}

/** ¿Este instante cae en horario nocturno para el workspace? */
export function isQuietNow(date: Date, wsSettings: Record<string, unknown>): boolean {
  const cfg = quietConfig(wsSettings)
  if (!cfg.enabled) return false
  const tz = tzFromSettings(JSON.stringify(wsSettings))
  return isQuietHour(localParts(date, tz).hour, cfg)
}
