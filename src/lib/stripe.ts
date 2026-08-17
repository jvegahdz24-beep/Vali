// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Stripe Integration
// Payment processing for plan subscriptions
// ═══════════════════════════════════════════════════════════════

import Stripe from 'stripe'
import { db } from '@/lib/db'
import { notifyPaymentFailed } from '@/lib/telegram-events'
import {
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from '@/lib/email'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe] STRIPE_SECRET_KEY not set. Stripe features will be disabled.')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
})

// ─── Plan pricing (inline price_data, no pre-created Price IDs needed) ────────

const IVA_RATE = 1.16 // México IVA 16%

const PLAN_DATA: Record<string, { name: string; monthlyMXN: number; yearlyMXN: number; implMXN: number }> = {
  starter: {
    name: 'ValiAutoFlow Starter',
    monthlyMXN: 430000,      // $4,300 MXN en centavos (base sin IVA)
    yearlyMXN: 430000 * 10,  // 2 meses gratis
    implMXN: 2500000,        // $25,000 MXN cuota de implementación
  },
  pro: {
    name: 'ValiAutoFlow Pro',
    monthlyMXN: 780000,
    yearlyMXN: 780000 * 10,
    implMXN: 4500000,        // $45,000 MXN
  },
  enterprise: {
    name: 'ValiAutoFlow Enterprise',
    monthlyMXN: 3550000,
    yearlyMXN: 3550000 * 10,
    implMXN: 9800000,        // $98,000 MXN
  },
}

// Mantener compatibilidad con código que importa PLAN_PRICE_IDS
export const PLAN_PRICE_IDS: Record<string, { monthly: string; yearly: string }> = {
  starter: { monthly: 'inline', yearly: 'inline' },
  pro: { monthly: 'inline', yearly: 'inline' },
  enterprise: { monthly: 'inline', yearly: 'inline' },
}

// ─── Checkout Session Creation ────────────────────────────────

export interface CreateCheckoutParams {
  workspaceId: string
  planKey: string
  billingPeriod: 'monthly' | 'yearly'
  customerEmail?: string
  successUrl?: string
  cancelUrl?: string
  coupon?: {
    id: string
    code: string
    stripeCouponId: string
    label: string
  }
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<{ checkoutUrl: string; sessionId: string }> {
  const { workspaceId, planKey, billingPeriod, customerEmail, successUrl, cancelUrl, coupon } = params

  const plan = PLAN_DATA[planKey]
  if (!plan) {
    throw new Error(`Invalid plan key: ${planKey}`)
  }

  // Base amounts in centavos × IVA (16%) = final charge to customer
  const baseAmount = billingPeriod === 'monthly' ? plan.monthlyMXN : plan.yearlyMXN
  const unitAmount = Math.round(baseAmount * IVA_RATE)
  const implAmount = Math.round(plan.implMXN * IVA_RATE)
  const intervalCount = 1
  const interval = billingPeriod === 'yearly' ? 'year' : 'month'
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Build checkout params as `any` because the SDK v22 types are stricter than the API.
  // One-time line_items in subscription mode are added to the first invoice (charged today).
  // trial_period_days: 30 → subscription billing starts on month 2.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionParams: any = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      // Monthly subscription — charged from month 2 (trial covers month 1)
      {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: plan.name,
            description: `Plan ${planKey} — facturación ${billingPeriod === 'monthly' ? 'mensual' : 'anual'} (IVA incluido)`,
          },
          unit_amount: unitAmount,
          recurring: {
            interval,
            interval_count: intervalCount,
          },
        },
        quantity: 1,
      },
      // One-time implementation fee — charged today on the initial invoice
      {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `Cuota de implementación — ${plan.name}`,
            description: 'Configuración inicial: canales, agentes IA y flujos (cobro único, IVA incluido)',
          },
          unit_amount: implAmount,
        },
        quantity: 1,
      },
    ],
    customer_email: customerEmail,
    success_url: successUrl || `${baseUrl}/select-plan?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${baseUrl}/select-plan?billing=cancelled`,
    metadata: {
      workspaceId,
      planKey,
      billingPeriod,
      ...(coupon && {
        couponId: coupon.id,
        couponCode: coupon.code,
        couponLabel: coupon.label,
      }),
    },
    subscription_data: {
      trial_period_days: 30,
      metadata: {
        workspaceId,
        planKey,
      },
    },
    allow_promotion_codes: !coupon,
    ...(coupon && {
      discounts: [{ coupon: coupon.stripeCouponId }],
    }),
  }

  const session = await stripe.checkout.sessions.create(sessionParams)

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
      const { workspaceId, planKey, billingPeriod, couponId, couponCode, couponLabel } = session.metadata || {}
      if (workspaceId && planKey) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string) as any
        const subscriptionRecord = await db.subscription.upsert({
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
            couponCode: couponCode || null,
            discountAmount: typeof session.total_details?.amount_discount === 'number'
              ? session.total_details.amount_discount / 100
              : null,
            metadata: JSON.stringify({
              couponId: couponId || null,
              couponCode: couponCode || null,
              couponLabel: couponLabel || null,
            }),
          },
          update: {
            plan: planKey,
            status: 'active',
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            amount: (sub.items.data[0]?.price.unit_amount || 0) / 100,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            couponCode: couponCode || null,
            discountAmount: typeof session.total_details?.amount_discount === 'number'
              ? session.total_details.amount_discount / 100
              : null,
            metadata: JSON.stringify({
              couponId: couponId || null,
              couponCode: couponCode || null,
              couponLabel: couponLabel || null,
            }),
          },
        })
        if (couponId && couponCode) {
          const existingRedemption = await db.couponRedemption.findFirst({
            where: { checkoutSessionId: session.id },
          })
          if (!existingRedemption) {
            await db.couponRedemption.create({
              data: {
                couponId,
                workspaceId,
                subscriptionId: subscriptionRecord.id,
                checkoutSessionId: session.id,
                plan: planKey,
                discountAmount: typeof session.total_details?.amount_discount === 'number'
                  ? session.total_details.amount_discount / 100
                  : null,
                currency: session.currency?.toUpperCase() || 'MXN',
                metadata: JSON.stringify({
                  stripeCustomerId: session.customer,
                  stripeSubscriptionId: session.subscription,
                  couponLabel: couponLabel || null,
                }),
              },
            })
            await db.coupon.update({
              where: { id: couponId },
              data: { redeemedCount: { increment: 1 } },
            })
          }
        }
        // Ensure workspace is active
        await db.workspace.update({
          where: { id: workspaceId },
          data: { plan: planKey, isActive: true },
        })
        // Send payment confirmation email
        const owner = await getWorkspaceOwner(workspaceId)
        if (owner) {
          const amount = (sub.items.data[0]?.price.unit_amount || 0) / 100
          const nextRenewal = new Date(sub.current_period_end * 1000)
          sendPaymentSuccessEmail(owner.email, owner.name, planKey, amount, nextRenewal).catch(() => {})
        }
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
          data: { plan: 'free', status: 'cancelled', amount: 0, cancelledAt: new Date() },
        })
        await db.workspace.update({
          where: { id: workspaceId },
          data: { plan: 'free', isActive: false },
        })
        // Send cancellation email
        const owner = await getWorkspaceOwner(workspaceId)
        if (owner) {
          sendSubscriptionCancelledEmail(owner.email, owner.name).catch(() => {})
        }
      }
      return { handled: true, action: 'subscription_cancelled' }
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as any
      if (invoice.subscription) {
        const updated = await db.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: {
            status: 'active',
            currentPeriodEnd: new Date((invoice.period_end as number) * 1000),
          },
        })
        // Reactivate workspace if it was suspended
        if (updated.count > 0) {
          const sub = await db.subscription.findFirst({
            where: { stripeSubscriptionId: invoice.subscription as string },
          })
          if (sub?.workspaceId) {
            await db.workspace.update({
              where: { id: sub.workspaceId },
              data: { isActive: true },
            })
            // Send payment success email
            const owner = await getWorkspaceOwner(sub.workspaceId)
            if (owner) {
              const amount = (invoice.amount_paid || 0) / 100
              const nextRenewal = new Date((invoice.period_end as number) * 1000)
              sendPaymentSuccessEmail(owner.email, owner.name, sub.plan, amount, nextRenewal).catch(() => {})
            }
          }
        }
      }
      return { handled: true, action: 'payment_succeeded' }
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as any
      if (invoice.subscription) {
        const updated = await db.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: { status: 'past_due' },
        })
        // Suspend workspace if this is a final failure (attempt >= 3) or if already past_due
        // Stripe sets next_payment_attempt to null on final failure
        const isFinalFailure = invoice.next_payment_attempt === null
        if (isFinalFailure && updated.count > 0) {
          const sub = await db.subscription.findFirst({
            where: { stripeSubscriptionId: invoice.subscription as string },
          })
          if (sub?.workspaceId) {
            await db.workspace.update({
              where: { id: sub.workspaceId },
              data: { isActive: false },
            })
          }
        }
        // Always send payment failed email
        const sub = await db.subscription.findFirst({
          where: { stripeSubscriptionId: invoice.subscription as string },
        })
        if (sub?.workspaceId) {
          const owner = await getWorkspaceOwner(sub.workspaceId)
          if (owner) {
            const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            sendPaymentFailedEmail(owner.email, owner.name, `${appUrl}/select-plan`).catch(() => {})
          }

          // ── Section 15 — Payment-failed Telegram notification ──
          // Spec §15: "Pago fallido del tenant {nombre}. Suspensión en 3 días."
          // We default to 3 days (matches the spec) regardless of when
          // Stripe will actually retry. The `amount`/`currency` are
          // forwarded when available so the operator sees the size of
          // the failed charge at a glance.
          try {
            const ws = await db.workspace.findUnique({
              where: { id: sub.workspaceId },
              select: { name: true },
            })
            const tenantName = ws?.name ?? owner?.name ?? 'Sin nombre'
            const amount = typeof invoice.amount_due === 'number' ? invoice.amount_due / 100 : undefined
            const currency = (invoice.currency as string | undefined)?.toUpperCase()
            void notifyPaymentFailed(sub.workspaceId, {
              tenantName,
              suspensionDays: 3,
              amount,
              currency,
            })
          } catch (err) {
            console.warn('[Stripe] payment-failed telegram notify error (non-critical):', err)
          }
        }
      }
      return { handled: true, action: 'payment_failed' }
    }
    default:
      return { handled: false }
  }
}

export { stripe }

// ─── Internal: Get workspace owner email ─────────────────────

async function getWorkspaceOwner(workspaceId: string): Promise<{ email: string; name: string } | null> {
  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, role: 'owner' },
    include: { user: { select: { email: true, name: true } } },
  })
  if (!member?.user?.email) return null
  return { email: member.user.email, name: member.user.name || 'Usuario' }
}
