// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Stripe Customer Portal Endpoint
// POST /api/billing/portal — Create a Customer Portal session
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createPortalSession, createCustomer } from '@/lib/stripe'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { rbac } from '@/lib/rbac'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing required field: workspaceId' },
        { status: 400 }
      )
    }

    // RBAC: Billing portal requires owner or admin
    await rbac.ownerOrAdmin(session, workspaceId)

    // Get workspace subscription
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        subscription: true,
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

    const subscription = workspace.subscription

    if (!subscription || !subscription.stripeCustomerId) {
      // No Stripe customer yet — create one
      const ownerEmail = workspace.members[0]?.user?.email
      const ownerName = workspace.members[0]?.user?.name

      if (!ownerEmail) {
        return NextResponse.json(
          { error: 'No owner email found for this workspace' },
          { status: 400 }
        )
      }

      const customerId = await createCustomer(
        ownerEmail,
        ownerName || workspace.name,
        { workspaceId }
      )

      // Save customer ID to subscription
      await db.subscription.update({
        where: { id: subscription?.id || 'unknown' },
        data: { stripeCustomerId: customerId },
      }).catch(() => {
        // If no subscription exists yet, create one
        return db.subscription.create({
          data: {
            workspaceId: workspaceId as string,
            plan: 'free',
            amount: 0,
            currency: 'MXN',
            interval: 'monthly',
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            stripeCustomerId: customerId,
          },
        })
      })

      // For new customers, redirect to checkout instead of portal
      return NextResponse.json({
        success: true,
        needsCheckout: true,
        message: 'No active subscription found. Please select a plan to get started.',
      })
    }

    // Create portal session
    const result = await createPortalSession({
      customerId: subscription.stripeCustomerId,
    })

    return NextResponse.json({
      success: true,
      portalUrl: result.portalUrl,
    })
  } catch (error) {
    return errorResponse(error, 'Error al crear sesión del portal')
  }
}
