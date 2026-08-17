// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Activate Trial Plan
// POST /api/billing/trial
// Activates a 30-day trial subscription — no payment required
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { sendWelcomeEmail } from '@/lib/email'

const TRIAL_DAYS = 30

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    // Get workspace owned by this user
    const member = await db.workspaceMember.findFirst({
      where: { userId: session.userId, role: 'owner' },
      include: { workspace: { include: { subscription: true } } },
    })

    if (!member) {
      return NextResponse.json({ error: 'Workspace no encontrado.' }, { status: 404 })
    }

    const workspace = member.workspace
    const now = new Date()
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

    // Upsert subscription to trial
    await db.subscription.upsert({
      where: { workspaceId: workspace.id },
      update: {
        plan: 'trial',
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEnd: trialEnd,
        amount: 0,
        currency: 'MXN',
        interval: 'monthly',
      },
      create: {
        workspaceId: workspace.id,
        plan: 'trial',
        status: 'trialing',
        provider: 'stripe',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEnd: trialEnd,
        amount: 0,
        currency: 'MXN',
        interval: 'monthly',
      },
    })

    // Update workspace plan limits for trial (Pro-level limits)
    await db.workspace.update({
      where: { id: workspace.id },
      data: {
        plan: 'trial',
        maxContacts: 500,
        maxAgents: 3,
        maxConversations: 500,
      },
    })

    // Send welcome email asynchronously (don't block response)
    db.user.findUnique({ where: { id: session.userId }, select: { email: true, name: true } })
      .then((user) => {
        if (user?.email) {
          sendWelcomeEmail(user.email, user.name ?? 'Usuario', 'trial').catch(() => {})
        }
      })
      .catch(() => {})

    return NextResponse.json({
      success: true,
      message: `Prueba de ${TRIAL_DAYS} días activada exitosamente.`,
      trialEnd: trialEnd.toISOString(),
    })
  } catch (error) {
    return errorResponse(error, 'Error al activar la prueba gratuita.')
  }
}
