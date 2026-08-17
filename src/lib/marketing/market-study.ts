// ═══════════════════════════════════════════════════════════════
// Estudio de mercado con IA para el módulo de marketing automotriz.
// Analiza el inventario real + audiencia del CRM y propone: posicionamiento,
// segmentos, ángulos de contenido y plan semanal. Mejores horarios salen de
// schedule.ts. Con fallback determinístico si la IA no está disponible.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAIJson } from '@/lib/ai/providers'
import { bestTimesSummary } from './schedule'

export interface MarketStudy {
  summary: string
  inventory: { total: number; avgPrice: number | null; topBrands: { name: string; count: number }[]; bodyTypes: { name: string; count: number }[] }
  segments: { name: string; description: string; channel: string }[]
  angles: string[]
  weeklyPlan: { day: string; idea: string; format: string; network: string }[]
  bestTimes: { network: string; label: string; windows: string }[]
  ai: boolean
}

function aggregate(items: { price: number | null; metadata: string | null; category: string | null }[]) {
  const brand: Record<string, number> = {}, body: Record<string, number> = {}
  let sum = 0, n = 0
  for (const it of items) {
    if (it.price != null) { sum += it.price; n++ }
    let m: Record<string, unknown> = {}
    try { m = JSON.parse(it.metadata || '{}') } catch { /* */ }
    const b = String(m.marca || '').trim(); if (b) brand[b] = (brand[b] || 0) + 1
    const c = String(m.carroceria || it.category || '').trim(); if (c) body[c] = (body[c] || 0) + 1
  }
  const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }))
  return { total: items.length, avgPrice: n ? Math.round(sum / n) : null, topBrands: top(brand), bodyTypes: top(body) }
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function fallbackStudy(inv: MarketStudy['inventory'], dealer: string): MarketStudy {
  const brands = inv.topBrands.map((b) => b.name).join(', ') || 'varias marcas'
  return {
    summary: `${dealer} cuenta con ${inv.total} unidades${inv.avgPrice ? ` con precio promedio de $${inv.avgPrice.toLocaleString('es-MX')}` : ''}. Marcas destacadas: ${brands}. Enfoque: generar confianza y mostrar relación precio-valor con contenido visual constante en Facebook e Instagram.`,
    inventory: inv,
    segments: [
      { name: 'Comprador de primer auto', description: 'Jóvenes 22-32, buscan financiamiento y seguridad', channel: 'instagram' },
      { name: 'Familias', description: '30-45, priorizan espacio, rendimiento y garantía', channel: 'facebook' },
      { name: 'Comprador premium', description: 'Buscan seminuevos de gama alta y exclusividad', channel: 'instagram' },
    ],
    angles: ['Precio y financiamiento claro', 'Estado/kilometraje verificado', 'Recién ingresado / oferta de la semana', 'Prueba de manejo y garantía', 'Testimonios y entregas'],
    weeklyPlan: [
      { day: 'Lunes', idea: 'Unidad destacada de la semana', format: 'feed', network: 'instagram' },
      { day: 'Martes', idea: 'Specs + precio de un seminuevo', format: 'story', network: 'instagram' },
      { day: 'Miércoles', idea: 'Oferta / financiamiento', format: 'feed', network: 'facebook' },
      { day: 'Jueves', idea: 'Reel recorrido del auto', format: 'reel', network: 'instagram' },
      { day: 'Viernes', idea: 'Llamado a agendar prueba de manejo', format: 'feed', network: 'facebook' },
    ],
    bestTimes: bestTimesSummary(),
    ai: false,
  }
}

export async function generateMarketStudy(workspaceId: string): Promise<MarketStudy> {
  const [items, ws, contacts] = await Promise.all([
    db.catalogItem.findMany({ where: { workspaceId }, select: { price: true, metadata: true, category: true } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, settings: true } }),
    db.contact.count({ where: { workspaceId } }).catch(() => 0),
  ])
  const inv = aggregate(items)
  const dealer = ws?.name || 'El concesionario'
  let tenantApiKey: string | undefined
  try { const s = JSON.parse(ws?.settings || '{}'); tenantApiKey = (s.apiKeys?.glm || s.apiKeys?.zai) as string | undefined } catch { /* */ }

  try {
    const sys = 'Eres un estratega de marketing automotriz en México. Analizas el inventario y la audiencia de un concesionario y devuelves un plan accionable. Responde SOLO JSON válido.'
    const user = `Concesionario: ${dealer}. Inventario: ${inv.total} autos, precio promedio ${inv.avgPrice ?? 'n/d'}, marcas top: ${inv.topBrands.map((b) => `${b.name}(${b.count})`).join(', ') || 'n/d'}, carrocerías: ${inv.bodyTypes.map((b) => b.name).join(', ') || 'n/d'}. Contactos en CRM: ${contacts}.
Devuelve JSON: {"summary": string (2-3 frases de posicionamiento y oportunidad), "segments":[{"name","description","channel":"instagram|facebook"}] (3), "angles": string[] (5 ángulos de contenido que venden), "weeklyPlan":[{"day","idea","format":"feed|story|reel","network":"instagram|facebook"}] (5, Lun-Vie)}`
    const { data } = await chatWithAIJson<Partial<MarketStudy>>(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      'glm', undefined, { temperature: 0.6, maxTokens: 1500, disableThinking: true, ...(tenantApiKey ? { tenantApiKey } : {}) },
    )
    if (!data?.summary || !Array.isArray(data.segments)) throw new Error('incompleto')
    return {
      summary: data.summary,
      inventory: inv,
      segments: data.segments.slice(0, 3),
      angles: (data.angles || []).slice(0, 6),
      weeklyPlan: (data.weeklyPlan || []).slice(0, 5),
      bestTimes: bestTimesSummary(),
      ai: true,
    }
  } catch {
    return fallbackStudy(inv, dealer)
  }
}

export { DAYS }
