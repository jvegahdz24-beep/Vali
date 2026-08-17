// ═══════════════════════════════════════════════════════════════
// Resolución de aprobaciones pendientes (pagos/facturas retenidos por
// el candado "Exigir aprobación"). ÚNICA fuente de la lógica: la usan
// la API /api/approvals (tarjeta del Tablero) y el Copiloto IA.
// approve → ejecuta la acción retenida y avisa al cliente por WhatsApp.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { createTenantPaymentLink, createTenantInvoice } from '@/lib/erp/payments'
import { sendOperatorMessage } from '@/lib/whatsapp/operator-send'
import { buildTrackedQuoteLink } from '@/lib/tracking'

export interface ResolveResult {
  ok: boolean
  status: 'executed' | 'failed' | 'rejected'
  resultNote: string
  error?: string
}

export async function resolveApproval(opts: {
  id: string
  action: 'approve' | 'reject'
  resolvedBy: string
  workspaceId?: string // si viene, se valida que la aprobación pertenezca al workspace
}): Promise<ResolveResult> {
  const appr = await db.pendingApproval.findUnique({ where: { id: opts.id } })
  if (!appr) return { ok: false, status: 'failed', resultNote: '', error: 'Aprobación no encontrada' }
  if (opts.workspaceId && appr.workspaceId !== opts.workspaceId) {
    return { ok: false, status: 'failed', resultNote: '', error: 'Aprobación de otro workspace' }
  }
  if (appr.status !== 'pending') return { ok: false, status: 'failed', resultNote: '', error: 'Ya fue resuelta' }

  if (opts.action === 'reject') {
    await db.pendingApproval.update({
      where: { id: appr.id },
      data: { status: 'rejected', resolvedBy: opts.resolvedBy, resolvedAt: new Date(), resultNote: 'Rechazada por el operador' },
    })
    return { ok: true, status: 'rejected', resultNote: 'Rechazada por el operador' }
  }

  const ws = await db.workspace.findUnique({ where: { id: appr.workspaceId }, select: { settings: true } })
  const payload = JSON.parse(appr.payload || '{}')
  let resultNote = ''
  let newStatus: 'executed' | 'failed' = 'executed'

  if (appr.type === 'payment') {
    const link = await createTenantPaymentLink({
      settings: ws?.settings || '{}', amountMXN: payload.amountMXN, concept: payload.concept,
      customerEmail: payload.email || undefined,
      metadata: { workspaceId: appr.workspaceId, contactId: appr.contactId || '' },
    })
    if (link.configured) {
      const trackedUrl = appr.contactId ? buildTrackedQuoteLink(appr.contactId, link.url) : link.url
      if (appr.conversationId && payload.phone) {
        await sendOperatorMessage({
          workspaceId: appr.workspaceId, phone: payload.phone,
          message: `💳 Aquí tienes tu link de pago seguro:\n${trackedUrl}`,
          conversationId: appr.conversationId, contactId: appr.contactId ?? null,
        }).catch(() => {})
      }
      resultNote = `Link generado y enviado: ${trackedUrl}`
    } else {
      newStatus = 'failed'; resultNote = `No se pudo generar el link (${link.reason}). Configura tu Stripe.`
    }
  } else if (appr.type === 'invoice') {
    const inv = await createTenantInvoice({
      settings: ws?.settings || '{}', rfc: payload.rfc || '', razonSocial: payload.razon || '',
      usoCFDI: payload.uso || undefined, amountMXN: payload.amountMXN || 0, concept: 'Venta',
    })
    if (inv.configured) {
      resultNote = `CFDI generada (id ${inv.id})`
      if (appr.conversationId && payload.phone) {
        await sendOperatorMessage({
          workspaceId: appr.workspaceId, phone: payload.phone,
          message: `🧾 Tu factura ya fue generada. En breve te llega por correo.`,
          conversationId: appr.conversationId, contactId: appr.contactId ?? null,
        }).catch(() => {})
      }
    } else {
      newStatus = 'failed'; resultNote = `No se pudo generar la factura (${inv.reason}). Configura tu proveedor CFDI.`
    }
  }

  await db.pendingApproval.update({
    where: { id: appr.id },
    data: { status: newStatus, resolvedBy: opts.resolvedBy, resolvedAt: new Date(), resultNote },
  })
  return { ok: newStatus === 'executed', status: newStatus, resultNote }
}
