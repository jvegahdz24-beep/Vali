// ═══════════════════════════════════════════════════════════════
// Admin — Subscription Detail & Update
// GET   /api/admin/subscriptions/[id]
// PATCH /api/admin/subscriptions/[id] — change plan, cancel, etc.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'
import { PLANS } from '@/lib/constants'

// Precios y límites desde la ÚNICA fuente de verdad (constants.ts).
const planPrices: Record<string, number> = Object.fromEntries(
  Object.entries(PLANS).map(([k, p]) => [k, p.price])
)
const planLimits: Record<string, { maxContacts: number; maxAgents: number; maxConversations: number }> =
  Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, {
    maxContacts: p.limits.maxContacts,
    maxAgents: p.limits.maxAgents,
    maxConversations: p.limits.maxConversations,
  }]))

const updateSubSchema = z.object({
  plan: z.enum(['free', 'trial', 'starter', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'trialing', 'cancelled', 'past_due', 'paused']).optional(),
  trialEnd: z.string().datetime().optional().nullable(),
  amount: z.number().min(0).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params

    const sub = await db.subscription.findUnique({
      where: { id },
      include: {
        workspace: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            _count: {
              select: { contacts: true, conversations: true, deals: true, agents: true },
            },
          },
        },
      },
    })

    if (!sub) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ subscription: sub })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const data = updateSubSchema.parse(body)

    const sub = await db.subscription.findUnique({
      where: { id },
      include: { workspace: true },
    })

    if (!sub) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (data.plan !== undefined) {
      updateData.plan = data.plan
      updateData.amount = planPrices[data.plan] ?? 0
    }
    if (data.status !== undefined) updateData.status = data.status
    if (data.trialEnd !== undefined) updateData.trialEnd = data.trialEnd ? new Date(data.trialEnd) : null
    if (data.amount !== undefined) updateData.amount = data.amount

    const updatedSub = await db.subscription.update({
      where: { id },
      data: updateData,
    })

    // Sync workspace plan + limits if plan changed
    if (data.plan) {
      const limits = planLimits[data.plan]
      await db.workspace.update({
        where: { id: sub.workspaceId },
        data: {
          plan: data.plan,
          ...(limits && {
            maxContacts: limits.maxContacts,
            maxAgents: limits.maxAgents,
            maxConversations: limits.maxConversations,
          }),
        },
      })
    }

    return NextResponse.json({ subscription: updatedSub, message: 'Suscripción actualizada' })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: error.issues }, { status: 400 })
    }
    console.error('[admin/subscriptions/[id] PATCH]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
