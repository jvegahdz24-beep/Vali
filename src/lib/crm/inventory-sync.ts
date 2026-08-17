// ═══════════════════════════════════════════════════════════════
// Pipeline → Inventario (conexión pedida por Jhon 2026-07-13):
// cuando un trato se marca GANADO, la unidad del inventario que se vendió
// se marca 'vendido' + isActive:false (así el bot deja de ofrecerla al
// instante — misma regla de oro del importador DMS) y queda anotado en la
// bitácora del contacto.
//
// El match es CONSERVADOR: solo si UNA unidad disponible coincide con el
// título del trato o con el vehículo de interés del LeadProfile. Ante
// ambigüedad no se toca nada (mejor no marcar que marcar la unidad equivocada).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logTimelineEvent } from '@/lib/erp/bitacora'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

// ── Matching compartido: el trato ↔ la unidad del catálogo ──
async function findMatchingUnit(params: {
  workspaceId: string
  dealTitle: string
  contactId?: string | null
  /** filtra por estatus de la unidad (metadata.status); default: todo menos vendido */
  accept: (status: string, meta: Record<string, unknown>) => boolean
}): Promise<{ id: string; name: string; metadata: string } | null> {
  const haystackParts: string[] = [params.dealTitle || '']
  if (params.contactId) {
    const lp = await db.leadProfile.findUnique({ where: { contactId: params.contactId }, select: { preferredProduct: true } }).catch(() => null)
    if (lp?.preferredProduct) haystackParts.push(lp.preferredProduct)
  }
  const haystack = norm(haystackParts.join(' · '))
  if (haystack.length < 3) return null

  const rows = await db.catalogItem.findMany({
    where: { workspaceId: params.workspaceId },
    select: { id: true, name: true, metadata: true },
  }).catch(() => [])
  const candidates = rows.filter((it) => {
    let meta: Record<string, unknown> = {}
    try { meta = JSON.parse(it.metadata || '{}') } catch { /* */ }
    return params.accept(String(meta.status || 'disponible'), meta)
  })
  const matches = candidates.filter((it) => {
    const n = norm(it.name)
    if (!n) return false
    if (haystack.includes(n)) return true
    const tokens = n.split(' ').filter((t) => t.length >= 3)
    return tokens.length >= 2 && tokens.every((t) => haystack.includes(t))
  })
  // CONSERVADOR: solo con coincidencia inequívoca
  return matches.length === 1 ? matches[0] : null
}

async function setUnitStatus(unitId: string, currentMetadata: string, patch: Record<string, unknown>, isActive: boolean): Promise<void> {
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(currentMetadata || '{}') } catch { /* */ }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete meta[k]
    else meta[k] = v
  }
  await db.catalogItem.update({ where: { id: unitId }, data: { isActive, metadata: JSON.stringify(meta) } })
}

/** Trato entra a NEGOCIACIÓN → la unidad se APARTA (deja de ofrecerla el bot). */
export async function reserveInventoryForDeal(params: {
  workspaceId: string; dealId: string; dealTitle: string; contactId?: string | null
}): Promise<{ reserved: boolean; itemName?: string }> {
  try {
    const unit = await findMatchingUnit({ ...params, accept: (s) => s === 'disponible' })
    if (!unit) return { reserved: false }
    await setUnitStatus(unit.id, unit.metadata, { status: 'apartado', apartadoDealId: params.dealId, apartadoAt: new Date().toISOString() }, false)
    console.log(`[InventorySync] 📌 Unidad "${unit.name}" APARTADA (trato ${params.dealId} en Negociación)`)
    if (params.contactId) {
      await logTimelineEvent({
        workspaceId: params.workspaceId, contactId: params.contactId, type: 'deal',
        title: `📌 Unidad apartada: ${unit.name} — trato en Negociación (el bot ya no la ofrece)`,
        source: 'system', importance: 'high', metadata: { dealId: params.dealId, catalogItemId: unit.id },
      }).catch(() => {})
    }
    return { reserved: true, itemName: unit.name }
  } catch { return { reserved: false } }
}

/** Trato PERDIDO o sale de Negociación sin ganar → la unidad apartada POR ESE trato se libera. */
export async function releaseInventoryForDeal(params: {
  workspaceId: string; dealId: string; contactId?: string | null; reason: string
}): Promise<{ released: boolean; itemName?: string }> {
  try {
    const rows = await db.catalogItem.findMany({
      where: { workspaceId: params.workspaceId },
      select: { id: true, name: true, metadata: true },
    }).catch(() => [])
    const held = rows.filter((it) => {
      try {
        const m = JSON.parse(it.metadata || '{}')
        return m.status === 'apartado' && m.apartadoDealId === params.dealId
      } catch { return false }
    })
    if (held.length === 0) return { released: false }
    for (const unit of held) {
      await setUnitStatus(unit.id, unit.metadata, { status: 'disponible', apartadoDealId: undefined, apartadoAt: undefined }, true)
      console.log(`[InventorySync] 🔓 Unidad "${unit.name}" LIBERADA (${params.reason}) — vuelve a estar disponible para el bot`)
      if (params.contactId) {
        await logTimelineEvent({
          workspaceId: params.workspaceId, contactId: params.contactId, type: 'deal',
          title: `🔓 Unidad liberada: ${unit.name} — ${params.reason} (disponible de nuevo)`,
          source: 'system', importance: 'normal', metadata: { dealId: params.dealId, catalogItemId: unit.id },
        }).catch(() => {})
      }
    }
    return { released: true, itemName: held[0].name }
  } catch { return { released: false } }
}

/** Trato GANADO → el contacto queda marcado como CLIENTE (etiqueta + bitácora).
 *  No se toca Contact.status (sus valores válidos son active/inactive/archived/blocked). */
export async function markContactAsCustomer(params: {
  workspaceId: string; contactId: string; dealId: string; dealTitle: string
}): Promise<void> {
  try {
    const c = await db.contact.findUnique({ where: { id: params.contactId }, select: { tags: true } })
    if (!c) return
    let tags: string[] = []
    try { const t = JSON.parse(c.tags || '[]'); tags = Array.isArray(t) ? t.map(String) : [] } catch { /* */ }
    if (!tags.some((t) => t.toLowerCase() === 'cliente')) {
      tags.push('cliente')
      await db.contact.update({ where: { id: params.contactId }, data: { tags: JSON.stringify(tags) } })
    }
    await logTimelineEvent({
      workspaceId: params.workspaceId, contactId: params.contactId, type: 'milestone',
      title: `🏆 Se convirtió en CLIENTE — trato ganado: ${params.dealTitle}`,
      dedupeKey: `customer-${params.dealId}`,
      source: 'system', importance: 'high', metadata: { dealId: params.dealId },
    }).catch(() => {})
    console.log(`[InventorySync] 🏆 Contacto ${params.contactId} etiquetado CLIENTE (trato ${params.dealId})`)
  } catch { /* no crítico */ }
}

export async function markInventorySoldForWonDeal(params: {
  workspaceId: string
  dealId: string
  dealTitle: string
  contactId?: string | null
}): Promise<{ sold: boolean; itemName?: string }> {
  try {
    // Prioridad: una unidad apartada POR ESTE MISMO trato gana sin ambigüedad;
    // si no, coincidencia inequívoca entre las no vendidas.
    const unit = await findMatchingUnit({
      ...params,
      accept: (s) => s !== 'vendido',
    }) || null
    const held = unit ? null : (await db.catalogItem.findMany({
      where: { workspaceId: params.workspaceId },
      select: { id: true, name: true, metadata: true },
    }).catch(() => [])).find((it) => {
      try { const m = JSON.parse(it.metadata || '{}'); return m.status === 'apartado' && m.apartadoDealId === params.dealId } catch { return false }
    }) || null
    const target = unit || held
    if (!target) return { sold: false }

    await setUnitStatus(target.id, target.metadata, {
      status: 'vendido', vendidoAt: new Date().toISOString(), vendidoDealId: params.dealId,
      apartadoDealId: undefined, apartadoAt: undefined,
    }, false)
    console.log(`[InventorySync] 🚗 Unidad "${target.name}" marcada VENDIDA (trato ${params.dealId} ganado) — el bot deja de ofrecerla`)

    if (params.contactId) {
      await logTimelineEvent({
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        type: 'deal',
        title: `🏁 Unidad vendida: ${target.name} — trato ganado, retirada del inventario activo`,
        source: 'system',
        importance: 'high',
        metadata: { dealId: params.dealId, catalogItemId: target.id },
      }).catch(() => {})
    }
    return { sold: true, itemName: target.name }
  } catch (e) {
    console.error('[InventorySync] error (no crítico):', e instanceof Error ? e.message : e)
    return { sold: false }
  }
}
