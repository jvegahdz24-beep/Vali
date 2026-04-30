// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Stripe Checkout Endpoint
// POST /api/billing/checkout — Create a Stripe Checkout session
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession, PLAN_PRICE_IDS } from '@/lib/stripe'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, planKey, billingPeriod = 'monthly' } = body

    if (!workspaceId || !planKey) {
      return NextResponse.json(
        { error: 'Missing required fields: workspaceId, planKey' },
        { status: 400 }
      )
    }
    await requireWorkspace(workspaceId, session.userId)

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

    // Create Stripe Checkout session
    const result = await createCheckoutSession({
      workspaceId,
      planKey,
      billingPeriod,
      customerEmail: ownerEmail || undefined,
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId,
    })
  } catch (error) {
    return errorResponse(error, 'Error al crear sesión de pago')
  }
}
