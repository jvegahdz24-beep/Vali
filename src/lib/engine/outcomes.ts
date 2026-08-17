// ═══════════════════════════════════════════════════════════════
// Ciclo de aprendizaje de gBrain — resultados de cierre.
// Cuando un deal se gana o se pierde, registramos un EngineEvent
// ACTION_OUTCOME (CLOSED_WON / CLOSED_LOST). Esto es EXACTAMENTE lo
// que engine/memory.ts ya lee para calcular efectividad de patrones,
// confianza y siguiente-mejor-acción. Cierra el bucle "el cliente
// compró o no → gBrain guarda el resultado y aprende".
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { createTenantInvoice, getTenantCFDIConfig } from '@/lib/erp/payments'

// Genera la factura CFDI automáticamente al ganar un trato, SI el workspace lo
// activó (settings.autoCfdi), tiene PAC (Facturama) configurado, y el contacto
// tiene RFC. Guarda el resultado en deal.metadata.cfdi. Nunca lanza.
async function maybeAutoCfdi(workspaceId: string, dealId: string, contactId: string, value: number): Promise<void> {
  try {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    if (settings.autoCfdi !== true) return
    if (!getTenantCFDIConfig(ws?.settings)) return // sin PAC → no hay nada que timbrar

    const contact = await db.contact.findUnique({ where: { id: contactId }, select: { firstName: true, lastName: true, customFields: true } })
    let cf: Record<string, unknown> = {}
    try { cf = JSON.parse((contact?.customFields as string) || '{}') } catch { /* */ }
    const rfc = String(cf.rfc || cf.RFC || '').trim()
    const razon = String(cf.razonSocial || cf.razon_social || `${contact?.firstName || ''} ${contact?.lastName || ''}`).trim()
    if (!rfc) { await mergeDealCfdi(dealId, { status: 'pendiente', reason: 'falta_rfc' }); return }

    const inv = await createTenantInvoice({ settings: ws?.settings, rfc, razonSocial: razon, amountMXN: value || 0, concept: 'Venta de vehículo' })
    if (inv.configured) await mergeDealCfdi(dealId, { status: 'timbrada', id: inv.id, folio: inv.folio ?? null, at: new Date().toISOString() })
    else await mergeDealCfdi(dealId, { status: 'error', reason: inv.reason })
  } catch (e) {
    console.warn('[maybeAutoCfdi]', e instanceof Error ? e.message : e)
  }
}
async function mergeDealCfdi(dealId: string, cfdi: Record<string, unknown>): Promise<void> {
  const d = await db.deal.findUnique({ where: { id: dealId }, select: { metadata: true } })
  let meta: Record<string, unknown> = {}
  try { meta = JSON.parse(d?.metadata || '{}') } catch { /* */ }
  meta.cfdi = cfdi
  await db.deal.update({ where: { id: dealId }, data: { metadata: JSON.stringify(meta) } }).catch(() => {})
}

export async function recordDealOutcome(opts: {
  workspaceId: string
  contactId?: string | null
  won: boolean
  dealId: string
  value?: number | null
  reason?: string | null
}): Promise<void> {
  const { workspaceId, contactId, won, dealId, value, reason } = opts
  // EngineEvent.contactId es obligatorio: sin contacto no hay a quién atribuir el aprendizaje.
  if (!contactId) return
  try {
    // Evita duplicar el resultado si el mismo deal ya se registró como cerrado.
    const already = await db.engineEvent.findFirst({
      where: { workspaceId, contactId, type: 'ACTION_OUTCOME', subType: won ? 'CLOSED_WON' : 'CLOSED_LOST', metadata: { contains: `"dealId":"${dealId}"` } },
      select: { id: true },
    }).catch(() => null)
    if (already) return

    const contact = await db.contact
      .findUnique({ where: { id: contactId }, select: { leadScore: true, temperature: true, tags: true } })
      .catch(() => null)

    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId,
        type: 'ACTION_OUTCOME',
        subType: won ? 'CLOSED_WON' : 'CLOSED_LOST',
        score: contact?.leadScore ?? null,
        temperature: contact?.temperature ?? null,
        metadata: JSON.stringify({ dealId, value: value ?? null, reason: reason ?? null, recordedAt: new Date().toISOString() }),
      },
    })

    // Trato GANADO → el contacto es CLIENTE (post-venta). Le ponemos la etiqueta
    // "cliente" (visible en la bandeja/expediente y en la pestaña Clientes de
    // Contactos) y a partir de aquí sus mensajes los atiende el Agente de Soporte
    // (ver isClient en agent-selector). Idempotente: no duplica la etiqueta.
    if (won && contact) {
      try {
        let tags: string[] = []
        try { const a = JSON.parse(contact.tags || '[]'); if (Array.isArray(a)) tags = a.map(String) } catch { /* */ }
        if (!tags.some((t) => t.trim().toLowerCase() === 'cliente')) {
          tags.push('cliente')
          await db.contact.update({ where: { id: contactId }, data: { tags: JSON.stringify(tags) } })
        }
      } catch (e) {
        console.warn('[recordDealOutcome] no se pudo etiquetar cliente:', e instanceof Error ? e.message : e)
      }
      // ERP: factura CFDI automática al cierre (si el workspace lo activó + PAC + RFC).
      await maybeAutoCfdi(workspaceId, dealId, contactId, value ?? 0)
    }
  } catch (e) {
    console.error('[recordDealOutcome] failed', e)
  }
}
