// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Stripe Webhook Endpoint
// POST /api/billing/webhook — Handle Stripe webhook events
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { constructWebhookEvent, handleWebhookEvent } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    // Verify and construct the webhook event
    const event = await constructWebhookEvent(body, signature)

    // Handle the event (all DB logic is in handleWebhookEvent)
    const result = await handleWebhookEvent(event)

    return NextResponse.json({ received: true, ...result })
  } catch (error) {
    console.error('[Stripe Webhook Error]', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    )
  }
}
