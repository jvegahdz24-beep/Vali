// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Plan Usage API
// GET /api/billing/usage?workspaceId=X
// Returns current usage vs plan limits for the workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, getPlanLimits, aiUsageWindowStart } from '@/lib/api-auth'
import { PLANS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 })

    await requireWorkspace(workspaceId, session.userId)

    const { limits, planName } = await getPlanLimits(workspaceId)

    // Mensajes IA del CICLO actual del plan (se reinicia en la fecha de
    // renovación del plan del usuario, no el día 1 del calendario).
    const windowStart = await aiUsageWindowStart(workspaceId)

    const [contacts, agents, aiMessages] = await Promise.all([
      db.contact.count({ where: { workspaceId, status: { not: 'archived' } } }),
      db.agent.count({ where: { workspaceId, isActive: true } }),
      db.message.count({
        where: {
          conversation: { workspaceId },
          isAiGenerated: true,
          createdAt: { gte: windowStart },
        },
      }),
    ])

    const planDef = PLANS[planName] ?? PLANS['free']

    return Response.json({
      plan: {
        name: planDef.name,
        slug: planName,
        features: planDef.features,
      },
      limits: {
        maxContacts: limits.maxContacts,
        maxAgents: limits.maxAgents,
        maxAiMessages: limits.maxAiMessages,
        maxFollowUpDays: limits.maxFollowUpDays,
        whatsappEnabled: limits.whatsappEnabled,
        telegramEnabled: limits.telegramEnabled,
        instagramEnabled: limits.instagramEnabled,
        archetypesEnabled: limits.archetypesEnabled,
        leadScoringEnabled: limits.leadScoringEnabled,
        fullAnalyticsEnabled: limits.fullAnalyticsEnabled,
        valiGuardEnabled: limits.valiGuardEnabled,
        whiteLabel: limits.whiteLabel,
        apiAccess: limits.apiAccess,
        customAiTraining: limits.customAiTraining,
      },
      usage: {
        contacts,
        agents,
        aiMessagesThisMonth: aiMessages,
        // Fecha del próximo reinicio del contador (aniversario del plan).
        periodStart: windowStart.toISOString(),
        resetsAt: (() => { const d = new Date(windowStart); d.setMonth(d.getMonth() + 1); return d.toISOString() })(),
      },
      percentages: {
        contacts: limits.maxContacts === -1 ? 0 : Math.round((contacts / limits.maxContacts) * 100),
        agents: limits.maxAgents === -1 ? 0 : Math.round((agents / limits.maxAgents) * 100),
        aiMessages: limits.maxAiMessages === -1 ? 0 : Math.round((aiMessages / limits.maxAiMessages) * 100),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
