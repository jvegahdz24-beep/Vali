// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Stripe Checkout Endpoint
// POST /api/billing/checkout — Create a Stripe Checkout session
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession, PLAN_PRICE_IDS } from '@/lib/stripe'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import {
  CouponValidationError,
  ensureStripeCouponForCheckout,
  validateCouponForCheckout,
} from '@/lib/billing-coupons'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, planKey, billingPeriod = 'monthly', couponCode } = body

    if (!workspaceId || !planKey) {
      return NextResponse.json(
        { error: 'Missing required fields: workspaceId, planKey' },
        { status: 400 }
      )
    }
    const caller = await requireWorkspace(workspaceId, session.userId, { allowSuspended: true })
    requirePermission(caller.role, 'billing.manage')

    // Validate plan key
    if (!PLAN_PRICE_IDS[planKey]) {
      return NextResponse.json(
        { error: `Invalid plan key: ${planKey}. Valid plans: ${Object.keys(PLAN_PRICE_IDS).join(', ')}` },
        { status: 400 }
      )
    }

    // Validate billing period
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return NextResponse.json(
        { error: 'billingPeriod must be "monthly" or "yearly"' },
        { status: 400 }
      )
    }

    // Get workspace and user email
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: { user: { select: { email: true, name: true } } },
          take: 1,
          where: { role: 'owner' },
        },
      },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const ownerEmail = workspace.members[0]?.user?.email
    const validatedCoupon = couponCode
      ? await validateCouponForCheckout({ code: couponCode, workspaceId, planKey })
      : null
    const stripeCouponId = validatedCoupon
      ? await ensureStripeCouponForCheckout(validatedCoupon.coupon)
      : null

    // Create Stripe Checkout session
    const result = await createCheckoutSession({
      workspaceId,
      planKey,
      billingPeriod,
      customerEmail: ownerEmail || undefined,
      ...(validatedCoupon && stripeCouponId && {
        coupon: {
          id: validatedCoupon.coupon.id,
          code: validatedCoupon.coupon.code,
          stripeCouponId,
          label: validatedCoupon.label,
        },
      }),
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId,
      appliedCoupon: validatedCoupon
        ? {
            code: validatedCoupon.coupon.code,
            label: validatedCoupon.label,
            duration: validatedCoupon.coupon.duration,
          }
        : null,
    })
  } catch (error) {
    if (error instanceof CouponValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode })
    }
    return errorResponse(error, 'Error al crear sesión de pago')
  }
}
