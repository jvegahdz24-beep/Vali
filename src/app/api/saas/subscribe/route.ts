// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Plan Subscription API
// POST /api/saas/subscribe — Subscribe workspace to a paid plan
// Creates/updates Stripe subscription, stores plan in workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import {
  SAAS_PLAN_TO_INTERNAL,
  PLAN_LIMITS,
  type SaaSPlan,
} from '@/lib/saas/plan-limits'

// ─── Validation Schema ─────────────────────────────────────────

const subscribeSchema = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise']),
  workspaceId: z.string().min(1),
})

// ─── Stripe Price ID Mapping ──────────────────────────────────
// SaaS portal uses separate price IDs from the internal billing system

const SAAS_STRIPE_PRICE_IDS: Record<SaaSPlan, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID || '',
  professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
}

// ─── POST Handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ─── Auth Check ──────────────────────────────────────────
    const session = await requireAuth(req)

    // ─── Validate Input ──────────────────────────────────────
    const body = await req.json()
    const parsed = subscribeSchema.safeParse(body)

    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => i.message).join('. ')
      return NextResponse.json(
        { error: errors, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const { plan: saasPlan, workspaceId } = parsed.data
    const internalPlan = SAAS_PLAN_TO_INTERNAL[saasPlan]

    // ─── Workspace Access Check ──────────────────────────────
    await requireWorkspace(workspaceId, session.userId)

    // ─── Get Workspace with Owner Info ───────────────────────
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: { user: { select: { email: true, name: true } } },
          take: 1,
          where: { role: 'owner' },
        },
        subscription: true,
      },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const ownerEmail = workspace.members[0]?.user?.email
    const priceId = SAAS_STRIPE_PRICE_IDS[saasPlan]

    // ─── Check if Stripe Price ID is configured ──────────────
    if (!priceId) {
      return NextResponse.json(
        {
          error: `Stripe price ID for plan "${saasPlan}" is not configured. Please contact support.`,
          code: 'STRIPE_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    // ─── Create or Update Stripe Subscription ────────────────
    let stripeSubscriptionId = workspace.subscription?.stripeSubscriptionId
    let customerId = workspace.subscription?.stripeCustomerId || workspace.stripeCustomerId

    // Create Stripe customer if not exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ownerEmail || undefined,
        name: workspace.members[0]?.user?.name || workspace.name,
        metadata: { workspaceId },
      })
      customerId = customer.id
    }

    // Create or update subscription
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (stripeSubscriptionId) {
      // Update existing subscription
      try {
        const existingSub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
        const subItems = existingSub.items.data

        if (subItems.length > 0) {
          await stripe.subscriptions.update(stripeSubscriptionId, {
            items: [{
              id: subItems[0].id,
              price: priceId,
            }],
            metadata: {
              workspaceId,
              planKey: internalPlan,
              saasPlan,
            },
            proration_behavior: 'create_prorations',
          })
        }
      } catch (stripeError) {
        // Subscription may have been deleted — create new one
        console.warn('[SaaS Subscribe] Existing subscription not found, creating new:', stripeError)
        const newSub = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          metadata: {
            workspaceId,
            planKey: internalPlan,
            saasPlan,
          },
          payment_behavior: 'default_incomplete',
          expand: ['latest_invoice.payment_intent'],
        })
        stripeSubscriptionId = newSub.id
      }
    } else {
      // Create new subscription
      const newSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        metadata: {
          workspaceId,
          planKey: internalPlan,
          saasPlan,
        },
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      })
      stripeSubscriptionId = newSub.id
    }

    // ─── Update Workspace Settings ───────────────────────────
    const settings = JSON.parse(workspace.settings || '{}')
    settings.saas = {
      ...(settings.saas || {}),
      plan: saasPlan,
      subscribedAt: new Date().toISOString(),
      stripeSubscriptionId,
      stripeCustomerId: customerId,
    }

    const limits = PLAN_LIMITS[saasPlan]

    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: internalPlan,
        maxContacts: limits.maxContacts === Infinity ? 100000 : limits.maxContacts,
        maxAgents: limits.features.multiple_whatsapp ? 10 : 3,
        maxConversations: limits.maxMessages === null ? 100000 : Math.min(limits.maxMessages || 5000, 100000),
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubscriptionId,
        settings: JSON.stringify(settings),
      },
    })

    // ─── Update Subscription Record ──────────────────────────
    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    await db.subscription.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        plan: internalPlan,
        status: 'active',
        provider: 'stripe',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        amount: limits.priceUSD,
        currency: 'USD',
        interval: 'monthly',
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubscriptionId,
      },
      update: {
        plan: internalPlan,
        status: 'active',
        amount: limits.priceUSD,
        currency: 'USD',
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubscriptionId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    })

    // ─── Success Response ───────────────────────────────────
    return NextResponse.json({
      success: true,
      plan: saasPlan,
      internalPlan,
      workspaceId,
      stripeSubscriptionId,
      limits: {
        maxContacts: limits.maxContacts,
        maxWhatsApp: limits.maxWhatsApp,
        maxMessages: limits.maxMessages,
        features: limits.features,
      },
    })
  } catch (error) {
    return errorResponse(error, 'Error al procesar la suscripción')
  }
}
