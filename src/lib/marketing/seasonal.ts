// ═══════════════════════════════════════════════════════════════
// CALENDARIO INTELIGENTE POR TEMPORADA (F9, 2026-07-22)
// Sugiere QUÉ publicar según fechas clave del mercado mexicano + el mejor
// horario según la actividad real del negocio (cuándo escriben sus clientes).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

interface SeasonKey { md: string; name: string; angle: string; leadDays: number }

// Fechas clave (mes-día) relevantes para venta de autos en México.
const SEASONS: SeasonKey[] = [
  { md: '01-06', name: 'Reyes Magos', angle: 'regálate/regala movilidad para el año nuevo', leadDays: 7 },
  { md: '02-14', name: 'San Valentín', angle: 'el auto para sus escapadas en pareja', leadDays: 7 },
  { md: '03-21', name: 'Vacaciones de primavera', angle: 'listo para el viaje familiar', leadDays: 10 },
  { md: '05-10', name: 'Día de las Madres', angle: 'el auto seguro y cómodo que mamá merece', leadDays: 10 },
  { md: '06-15', name: 'Día del Padre', angle: 'la camioneta/auto para papá', leadDays: 10 },
  { md: '07-15', name: 'Vacaciones de verano', angle: 'road trip de verano sin preocupaciones', leadDays: 12 },
  { md: '09-16', name: 'Fiestas Patrias', angle: 'promoción mexicana, meses sin intereses', leadDays: 10 },
  { md: '11-18', name: 'El Buen Fin', angle: 'LA mejor oportunidad del año: enganche bajo y meses sin intereses', leadDays: 21 },
  { md: '12-12', name: 'Aguinaldo / Diciembre', angle: 'estrena con tu aguinaldo antes de que acabe el año', leadDays: 20 },
]

function daysUntil(md: string, from: Date): number {
  const [m, d] = md.split('-').map(Number)
  const year = from.getFullYear()
  let target = new Date(year, m - 1, d)
  if (target < from) target = new Date(year + 1, m - 1, d)
  return Math.ceil((target.getTime() - from.getTime()) / 86400000)
}

/** Mejor hora de publicación = hora del día con más mensajes ENTRANTES reales. */
async function bestHour(workspaceId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 60 * 86400000)
    const msgs = await db.message.findMany({
      where: { conversation: { workspaceId }, direction: 'inbound', createdAt: { gte: since } },
      select: { createdAt: true }, take: 3000,
    })
    if (msgs.length < 20) return 19 // default 7pm
    const buckets = new Array(24).fill(0)
    for (const m of msgs) buckets[new Date(m.createdAt).getHours()]++
    return buckets.indexOf(Math.max(...buckets))
  } catch { return 19 }
}

export interface SeasonalSuggestion {
  season: string; date: string; daysUntil: number; angle: string; recommendedHour: number; suggestedCars: string[]
}

export async function seasonalSuggestions(workspaceId: string, now = new Date()): Promise<{ suggestions: SeasonalSuggestion[]; bestHour: number }> {
  const hour = await bestHour(workspaceId)
  const cars = await db.catalogItem.findMany({ where: { workspaceId, isActive: true }, select: { name: true }, take: 6 })
  const carNames = cars.map((c) => c.name)
  // Fechas dentro de su ventana de anticipación (leadDays), ordenadas por cercanía.
  const upcoming = SEASONS
    .map((s) => ({ s, d: daysUntil(s.md, now) }))
    .filter(({ s, d }) => d <= s.leadDays + 3)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
    .map(({ s, d }) => {
      const [m, day] = s.md.split('-')
      return {
        season: s.name,
        date: `${day}/${m}`,
        daysUntil: d,
        angle: s.angle,
        recommendedHour: hour,
        suggestedCars: carNames.slice(0, 3),
      }
    })
  return { suggestions: upcoming, bestHour: hour }
}
