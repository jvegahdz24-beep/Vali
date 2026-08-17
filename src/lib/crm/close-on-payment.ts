// ═══════════════════════════════════════════════════════════════
// "Última milla": cuando el cliente PAGA (webhook de Stripe del tenant),
// se marca su trato como GANADO automáticamente y se dispara todo el cierre:
// comisión del vendedor + factura CFDI (vía recordDealOutcome). Esto convierte
// la "tasa de cierre 0%" en cierres reales sin intervención humana.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { recordDealOutcome } from '@/lib/engine/outcomes'

export interface CloseResult { ok: boolean; reason?: string; dealId?: string; value?: number }

export async function closeDealOnPayment(workspaceId: string, contactId: string, amountPaidMXN?: number): Promise<CloseResult> {
  if (!workspaceId || !contactId) return { ok: false, reason: 'missing_params' }
  try {
    // Deal activo del contacto (prioriza el de mayor valor / más reciente).
    const deal = await db.deal.findFirst({
      where: { workspaceId, contactId, status: 'active' },
      orderBy: [{ value: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, value: true },
    })
    if (!deal) return { ok: false, reason: 'no_active_deal' }

    const wonStage = await db.pipelineStage.findFirst({ where: { pipeline: { workspaceId }, isWon: true }, select: { id: true } }).catch(() => null)

    await db.deal.update({
      where: { id: deal.id },
      data: { status: 'won', wonAt: new Date(), ...(wonStage ? { stageId: wonStage.id } : {}) },
    })

    // Comisión + CFDI + etiqueta cliente + EngineEvent de aprendizaje.
    await recordDealOutcome({ workspaceId, contactId, won: true, dealId: deal.id, value: amountPaidMXN || deal.value || 0 })

    return { ok: true, dealId: deal.id, value: deal.value }
  } catch (e) {
    console.error('[closeDealOnPayment]', e)
    return { ok: false, reason: e instanceof Error ? e.message : 'error' }
  }
}
