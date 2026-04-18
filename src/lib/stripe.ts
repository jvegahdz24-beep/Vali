// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Stripe Integration
// Payment processing for plan subscriptions
// ═══════════════════════════════════════════════════════════════

import Stripe from 'stripe'
import { db } from '@/lib/db'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set. Stripe features will be disabled.')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
})

// ─── Plan to Stripe Price ID Mapping ──────────────────────────

export const PLAN_PRICE_IDS: Record<string, { monthly: string; yearly: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly_placeholder',
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || 'price_starter_yearly_placeholder',
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly_placeholder',
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly_placeholder',
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || 'price_enterprise_monthly_placeholder',
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || 'price_enterprise_yearly_placeholder',
  },
}

// ─── Checkout Session Creation ────────────────────────────────

export interface CreateCheckoutParams {
  workspaceId: string
  planKey: string
  billingPeriod: 'monthly' | 'yearly'
  customerEmail?: string
  successUrl?: string
  cancelUrl?: string
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
  const { workspaceId, planKey, billingPeriod, customerEmail, successUrl, cancelUrl } = params

  const priceIds = PLAN_PRICE_IDS[planKey]
  if (!priceIds) {
    throw new Error(`Invalid plan key: ${planKey}`)
  }

  const priceId = billingPeriod === 'monthly' ? priceIds.monthly : priceIds.yearly
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer_email: customerEmail,
    success_url: successUrl || `${baseUrl}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${baseUrl}/settings?billing=cancelled`,
    metadata: {
      workspaceId,
      planKey,
      billingPeriod,
    },
    subscription_data: {
      metadata: {
        workspaceId,
        planKey,
      },
    },
    allow_promotion_codes: true,
  })

  if (!session.url) {
    throw new Error('Failed to create checkout session URL')
  }

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
  }
}

// ─── Customer Portal Session ─────────────────────────────────

export interface CreatePortalParams {
  customerId: string
  returnUrl?: string
}

export async function createPortalSession(params: CreatePortalParams): Promise<{ portalUrl: string }> {
  const { customerId, returnUrl } = params
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || `${baseUrl}/settings`,
  })

  return {
    portalUrl: session.url,
  }
}

// ─── Customer Management ─────────────────────────────────────

export async function createCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata,
  })

  return customer.id
}

export async function getCustomer(customerId: string) {
  return stripe.customers.retrieve(customerId)
}

// ─── Webhook Handler ─────────────────────────────────────────

export async function constructWebhookEvent(payload: string | Buffer, signature: string): Promise<Stripe.Event> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<{ handled: boolean; action?: string }> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const { workspaceId, planKey, billingPeriod } = session.metadata || {}
      if (workspaceId && planKey) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string) as any
        await db.subscription.upsert({
          where: { workspaceId },
          create: {
            workspaceId,
            plan: planKey,
            status: 'active',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            amount: (sub.items.data[0]?.price.unit_amount || 0) / 100,
            currency: sub.currency?.toUpperCase() || 'MXN',
            interval: billingPeriod || 'monthly',
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
          },
          update: {
            plan: planKey,
            status: 'active',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            amount: (sub.items.data[0]?.price.unit_amount || 0) / 100,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
          },
        })
        // Update workspace plan
        await db.workspace.update({
          where: { id: workspaceId },
          data: { plan: planKey },
        })
      }
      return { handled: true, action: 'subscription_created' }
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as any
      const { workspaceId } = subscription.metadata || {}
      if (workspaceId) {
        await db.subscription.updateMany({
          where: { workspaceId },
          data: {
            status: subscription.status === 'active' ? 'active' : subscription.status === 'canceled' ? 'cancelled' : 'past_due',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        })
      }
      return { handled: true, action: 'subscription_updated' }
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as any
      const { workspaceId } = subscription.metadata || {}
      if (workspaceId) {
        await db.subscription.updateMany({
          where: { workspaceId },
          data: { plan: 'free', status: 'cancelled', amount: 0 },
        })
        await db.workspace.update({
          where: { id: workspaceId },
          data: { plan: 'free' },
        })
      }
      return { handled: true, action: 'subscription_cancelled' }
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as any
      if (invoice.subscription && invoice.metadata?.workspaceId) {
        await db.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: {
            status: 'active',
            currentPeriodEnd: new Date((invoice.period_end as number) * 1000),
          },
        })
      }
      return { handled: true, action: 'payment_succeeded' }
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as any
      if (invoice.subscription) {
        await db.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: { status: 'past_due' },
        })
      }
      return { handled: true, action: 'payment_failed' }
    }
    default:
      return { handled: false }
  }
}

export { stripe }
