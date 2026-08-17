import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PLANS } from '@/lib/constants'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { subscription: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const planKey = workspace.plan
    const planConfig = PLANS[planKey] || PLANS.free

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        plan: workspace.plan,
      },
      subscription: workspace.subscription || {
        plan: 'free',
        status: 'active',
        amount: 0,
        currency: 'MXN',
      },
      planDetails: planConfig,
      allPlans: Object.entries(PLANS).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        features: plan.features,
      })),
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener suscripción')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, plan, provider = 'stripe', providerPlanId, interval = 'monthly', amount } = body

    if (!workspaceId || !plan) {
      return NextResponse.json(
        { error: 'Missing required fields: workspaceId, plan' },
        { status: 400 }
      )
    }
    await requireWorkspace(workspaceId, session.userId)

    const planConfig = PLANS[plan]
    if (!planConfig) {
      return NextResponse.json({ error: `Invalid plan: ${plan}` }, { status: 400 })
    }

    const workspace = await db.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const subscription = await db.subscription.upsert({
      where: { workspaceId },
      update: {
        plan,
        status: 'active',
        provider,
        providerPlanId: providerPlanId || null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        amount: amount || planConfig.price,
        currency: planConfig.currency,
        interval,
        cancelledAt: null,
        cancelAt: null,
      },
      create: {
        workspaceId,
        plan,
        status: 'active',
        provider,
        providerPlanId: providerPlanId || null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        amount: amount || planConfig.price,
        currency: planConfig.currency,
        interval,
      },
    })

    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        plan,
        maxContacts: planConfig.limits.maxContacts,
        maxAgents: planConfig.limits.maxAgents,
        maxConversations: planConfig.limits.maxConversations,
      },
    })

    return NextResponse.json({ success: true, subscription })
  } catch (error) {
    return errorResponse(error, 'Error al actualizar suscripción')
  }
}
