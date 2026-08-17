// ═══════════════════════════════════════════════════════════════
// Webhook de pago del TENANT (Stripe) — "última milla".
// Cada negocio configura en SU Stripe un webhook a:
//   https://valiautoflow.com/api/webhooks/tenant-payment/<workspaceId>
// Cuando un cliente paga el link generado por la IA, aquí se marca el trato
// como GANADO y se dispara comisión + CFDI automáticamente.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { closeDealOnPayment } from '@/lib/crm/close-on-payment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') || ''

  try {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const pay = (settings.payments || {}) as Record<string, string>
    const secretKey = (pay.stripeSecretKey || '').trim()
    const webhookSecret = (pay.stripeWebhookSecret || '').trim()
    if (!secretKey || !webhookSecret) return new Response('Payment not configured', { status: 400 })

    const stripe = new Stripe(secretKey, { apiVersion: '2026-04-22.dahlia' })
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }

    // Nos interesa el pago completado del link generado por el motor de ventas.
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const obj = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent
      const meta = (obj.metadata || {}) as Record<string, string>
      const contactId = meta.contactId
      const amount = 'amount_total' in obj && obj.amount_total ? obj.amount_total / 100 : ('amount' in obj && obj.amount ? obj.amount / 100 : undefined)
      if (meta.source === 'revenue-engine' && contactId) {
        const r = await closeDealOnPayment(workspaceId, contactId, amount)
        console.log(`[TenantPayment:${workspaceId}] pago recibido → cierre:`, JSON.stringify(r))
      }
    }
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error(`[TenantPayment:${workspaceId}]`, e)
    return new Response('error', { status: 500 })
  }
}
