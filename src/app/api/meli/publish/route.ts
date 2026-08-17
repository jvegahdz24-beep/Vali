// ═══════════════════════════════════════════════════════════════
// POST /api/meli/publish — publica un auto del inventario en Mercado Libre.
// body: { workspaceId, catalogItemId }
// RBAC: crm.write.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { loadConnection, meliApi, vehicleToMeliItem, parseMeliLocation } from '@/lib/meli/client'
import { logMeli } from '@/lib/meli/log'

// Traduce los errores crípticos de la API de ML a mensajes accionables en español.
const ATTR_ES: Record<string, string> = {
  TRIM: 'Versión', DOORS: 'Puertas', FUEL_TYPE: 'Combustible', KILOMETERS: 'Kilometraje',
  BRAND: 'Marca', MODEL: 'Modelo', VEHICLE_YEAR: 'Año', TRANSMISSION: 'Transmisión',
}
function friendlyMeliError(raw: string, price: number | null): string {
  const min = raw.match(/minimum of price (\d+)/i)
  if (min) return `Mercado Libre exige un precio mínimo de $${Number(min[1]).toLocaleString('es-MX')} MXN en la categoría de autos (este artículo cuesta $${(price ?? 0).toLocaleString('es-MX')}). Solo se pueden publicar vehículos reales.`
  const missing = raw.match(/attributes \[([A-Z_, ]+)\] are required/i)
  if (missing) {
    const campos = missing[1].split(',').map((s) => ATTR_ES[s.trim()] || s.trim()).join(', ')
    return `Mercado Libre requiere estos datos del vehículo: ${campos}. Complétalos en Inventario → Editar auto y vuelve a publicar.`
  }
  if (/location/i.test(raw)) return 'Falta la ubicación del auto (ciudad y estado). Complétala en el campo "Ubicación / sucursal" del auto (ej. "Cancún, Quintana Roo") y vuelve a publicar.'
  if (/leaf category/i.test(raw)) return 'Error interno de categoría de Mercado Libre. Intenta de nuevo.'
  return raw
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, catalogItemId } = await req.json() as { workspaceId: string; catalogItemId: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const conn = await loadConnection(workspaceId)
    if (!conn || conn.status !== 'connected') throw new ApiError(400, 'Conecta tu cuenta de Mercado Libre primero')

    const item = await db.catalogItem.findFirst({ where: { id: catalogItemId, workspaceId } })
    if (!item) throw new ApiError(404, 'Auto no encontrado en el inventario')

    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(item.metadata || '{}') } catch { /* ignore */ }

    // ¿Ya publicado? evitar duplicados
    const existing = await db.meliListing.findFirst({ where: { workspaceId, catalogItemId } })
    if (existing) throw new ApiError(409, 'Este auto ya tiene una publicación en Mercado Libre')

    // ── Pre-validación con mensajes claros (requisitos reales de ML/autos) ──
    // 1) Debe ser un VEHÍCULO: ML solo permite autos aquí (categoría MLM1744,
    //    precio mínimo $200,000 MXN). Los planes/servicios no se pueden publicar.
    if (!meta.marca || !meta.modelo || !meta.year) {
      throw new ApiError(422, `"${item.name}" no parece un auto (le faltan marca, modelo o año). Mercado Libre solo permite publicar VEHÍCULOS desde aquí — además su categoría de autos exige precio mínimo de $200,000 MXN, así que planes o servicios no se pueden publicar.`)
    }
    // 2) Campos que la categoría de autos de ML exige sí o sí.
    const faltan: string[] = []
    if (!meta.version) faltan.push('Versión')
    if (!meta.combustible) faltan.push('Combustible')
    if (!meta.puertas) faltan.push('Puertas')
    if (!parseMeliLocation(meta.ubicacion as string | undefined, conn.siteId)) faltan.push('Ubicación / sucursal (ej. "Cancún, Quintana Roo")')
    if (faltan.length) {
      throw new ApiError(422, `Mercado Libre requiere estos datos del vehículo: ${faltan.join(', ')}. Complétalos en Inventario → Editar auto y vuelve a intentar.`)
    }

    const payload = vehicleToMeliItem({ name: item.name, price: item.price, currency: item.currency, category: item.category, description: item.description, imageUrl: item.imageUrl, metadata: meta }, conn.siteId)

    try {
      const created = await meliApi.createItem(conn, payload) as { id: string; permalink?: string; status?: string; price?: number; available_quantity?: number; thumbnail?: string }
      // Descripción por separado (la API de items ya no la acepta inline de forma fiable)
      const descText = (item.description || item.name || '').trim()
      if (descText) await meliApi.setDescription(conn, created.id, descText).catch(() => null)
      const listing = await db.meliListing.create({
        data: {
          workspaceId, catalogItemId, meliItemId: created.id, permalink: created.permalink ?? null,
          title: item.name, status: created.status || 'active', price: created.price ?? item.price,
          availableQuantity: created.available_quantity ?? 1, thumbnail: created.thumbnail ?? item.imageUrl ?? null,
          lastSyncedAt: new Date(), raw: JSON.stringify(created),
        },
      })
      await logMeli(workspaceId, 'publish', { targetType: 'listing', targetId: created.id, status: 'ok', message: `Publicado: ${item.name}`, metadata: { permalink: created.permalink } })
      return Response.json({ success: true, listing })
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Error al publicar'
      const msg = friendlyMeliError(raw, item.price)
      await logMeli(workspaceId, 'publish', { targetType: 'listing', targetId: catalogItemId, status: 'error', message: `${item.name}: ${raw}` })
      throw new ApiError(422, msg)
    }
  } catch (error) { return errorResponse(error) }
}
