// ═══════════════════════════════════════════════════════════════
// Mejores horarios de publicación por red social (mercado MX/LATAM).
// Basado en buenas prácticas de engagement: ventanas por día de semana
// en hora LOCAL del workspace. Lo usa el bot para decidir cuándo publicar.
// ═══════════════════════════════════════════════════════════════

export interface DayWindows { day: number; hours: number[] } // day 0=domingo

// Ventanas horarias de mayor alcance (hora local). 1=lun … 5=vie, 0/6 finde.
export const BEST_TIMES: Record<string, DayWindows[]> = {
  instagram: [
    { day: 1, hours: [12, 13, 19, 20] },
    { day: 2, hours: [11, 12, 13, 19, 20, 21] }, // martes pico
    { day: 3, hours: [11, 12, 13, 19, 20, 21] }, // miércoles pico
    { day: 4, hours: [11, 12, 13, 19, 20, 21] }, // jueves pico
    { day: 5, hours: [12, 13, 18, 19] },
    { day: 6, hours: [10, 11, 12] },
    { day: 0, hours: [11, 12, 19] },
  ],
  facebook: [
    { day: 1, hours: [10, 13, 19] },
    { day: 2, hours: [9, 10, 13, 14, 20] },
    { day: 3, hours: [9, 10, 13, 14, 20, 21] }, // miércoles pico
    { day: 4, hours: [10, 13, 14, 19, 20] },
    { day: 5, hours: [9, 10, 13, 19] },          // viernes alto
    { day: 6, hours: [11, 12] },
    { day: 0, hours: [12, 13] },
  ],
}

const TZ_DEFAULT = 'America/Mexico_City'

/** {hour, day} en la zona horaria indicada. */
function localParts(date: Date, tz: string): { hour: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false })
  const parts = fmt.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
  return { hour, day: day < 0 ? 0 : day }
}

/** ¿Es ahora una buena hora para publicar en esta red? */
export function isOptimalTime(network: string, date = new Date(), tz = TZ_DEFAULT): boolean {
  const table = BEST_TIMES[network]
  if (!table) return true
  const { hour, day } = localParts(date, tz)
  const win = table.find((w) => w.day === day)
  return !!win && win.hours.includes(hour)
}

/** ¿Es buen momento para CUALQUIERA de las redes dadas? */
export function isOptimalForAny(networks: string[], date = new Date(), tz = TZ_DEFAULT): boolean {
  return networks.some((n) => isOptimalTime(n, date, tz))
}

/** Próxima ventana óptima (texto legible) para mostrar en UI. */
export function nextOptimalSlot(network: string, from = new Date(), tz = TZ_DEFAULT): string {
  const table = BEST_TIMES[network]
  if (!table) return 'cualquier momento'
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  for (let i = 0; i < 8; i++) {
    const d = new Date(from.getTime() + i * 86_400_000)
    const { day, hour } = localParts(d, tz)
    const win = table.find((w) => w.day === day)
    if (!win) continue
    const future = win.hours.filter((h) => i > 0 || h > hour)
    if (future.length) {
      const h = future[0]
      return `${i === 0 ? 'hoy' : i === 1 ? 'mañana' : dayNames[day]} ${String(h).padStart(2, '0')}:00`
    }
  }
  return 'próxima semana'
}

/** Resumen legible de las mejores horas por red (para la UI / estudio). */
export function bestTimesSummary(): { network: string; label: string; windows: string }[] {
  const dayShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return Object.entries(BEST_TIMES).map(([network, table]) => {
    const top = table
      .filter((w) => w.day >= 1 && w.day <= 5)
      .map((w) => `${dayShort[w.day]} ${w.hours.map((h) => `${h}h`).join('/')}`)
      .join(' · ')
    return { network, label: network === 'instagram' ? 'Instagram' : 'Facebook', windows: top }
  })
}
