// ═══════════════════════════════════════════════════════════════
// ATRIBUCIÓN DE MARKETING (F1, 2026-07-22)
// Cierra el círculo: ¿qué anuncio/creativo trajo leads y ventas?
// Fuentes de verdad:
//   - contact.customFields.adSource → texto del anuncio CTWA por el que llegó
//     el lead (lo captura connection.ts del externalAdReply de WhatsApp).
//   - Deal status 'won' → venta.
//   - MarketingPost → creativos publicados (para cruzar por auto/campaña).
// Devuelve ROI por fuente de anuncio y por modelo de auto.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export interface AttributionRow {
  source: string          // texto del anuncio / campaña
  leads: number
  hot: number
  won: number
  revenue: number
  conversionRate: number  // won / leads
}

export interface AttributionReport {
  totalLeadsFromAds: number
  totalWon: number
  totalRevenue: number
  bySource: AttributionRow[]
  byCar: { car: string; leadsMentioning: number; won: number }[]
  generatedAt: string
}

export async function buildAttributionReport(workspaceId: string, days = 90): Promise<AttributionReport> {
  const since = new Date(Date.now() - days * 86400000)

  // Contactos que llegaron de un anuncio (tienen adSource en customFields)
  const contacts = await db.contact.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: { id: true, temperature: true, customFields: true },
  })

  const wonByContact = new Map<string, number>()
  const wonDeals = await db.deal.findMany({
    where: { workspaceId, status: 'won', updatedAt: { gte: since } },
    select: { contactId: true, value: true },
  })
  for (const d of wonDeals) if (d.contactId) wonByContact.set(d.contactId, (wonByContact.get(d.contactId) || 0) + (d.value || 0))

  const bucket = new Map<string, AttributionRow>()
  let totalLeadsFromAds = 0
  for (const c of contacts) {
    let cf: Record<string, unknown> = {}
    try { cf = JSON.parse(c.customFields || '{}') } catch { /* */ }
    const src = String(cf.adSource || '').trim()
    if (!src) continue
    totalLeadsFromAds++
    const key = src.slice(0, 80)
    const row = bucket.get(key) || { source: key, leads: 0, hot: 0, won: 0, revenue: 0, conversionRate: 0 }
    row.leads++
    if (c.temperature === 'hot') row.hot++
    if (wonByContact.has(c.id)) { row.won++; row.revenue += wonByContact.get(c.id) || 0 }
    bucket.set(key, row)
  }
  const bySource = [...bucket.values()]
    .map((r) => ({ ...r, conversionRate: r.leads ? Math.round((r.won / r.leads) * 100) : 0 }))
    .sort((a, b) => b.won - a.won || b.leads - a.leads)

  // Cruce por AUTO: ¿cuántos leads de anuncio mencionan (por adSource) cada auto
  // publicado?, ¿cuántos cerraron? — indica qué creativo/modelo jala.
  const cars = await db.catalogItem.findMany({ where: { workspaceId }, select: { name: true } })
  const byCar = cars.map((car) => {
    const toks = norm(car.name).split(/\s+/).filter((t) => t.length >= 3)
    if (!toks.length) return null
    let leadsMentioning = 0, won = 0
    for (const c of contacts) {
      let cf: Record<string, unknown> = {}
      try { cf = JSON.parse(c.customFields || '{}') } catch { /* */ }
      const src = norm(String(cf.adSource || ''))
      if (!src) continue
      if (toks.filter((t) => src.includes(t)).length >= Math.min(2, toks.length)) {
        leadsMentioning++
        if (wonByContact.has(c.id)) won++
      }
    }
    return leadsMentioning > 0 ? { car: car.name, leadsMentioning, won } : null
  }).filter(Boolean).sort((a, b) => (b!.leadsMentioning - a!.leadsMentioning)) as { car: string; leadsMentioning: number; won: number }[]

  return {
    totalLeadsFromAds,
    totalWon: bySource.reduce((s, r) => s + r.won, 0),
    totalRevenue: bySource.reduce((s, r) => s + r.revenue, 0),
    bySource: bySource.slice(0, 20),
    byCar: byCar.slice(0, 15),
    generatedAt: new Date().toISOString(),
  }
}
