// ═══════════════════════════════════════════════════════════════
// JHON ENGINE — Auto-Actions Cron Engine
// Processes expired recommended actions and detects
// NO_RESPONSE outcomes autonomously
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

/**
 * Process expired recommended actions.
 * When an action was recommended but not executed within its deadline,
 * the escalation action (ifNotMet) is auto-triggered and a score penalty is applied.
 */
export async function processExpiredActions() {
  const now = new Date()
  let triggeredCount = 0

  // Find actions that were recommended but not executed within deadline
  const recentActions = await db.engineEvent.findMany({
    where: {
      type: 'ACTION_RECOMMENDED',
      createdAt: {
        gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const processed = new Set<string>()

  for (const action of recentActions) {
    if (processed.has(action.contactId)) continue
    processed.add(action.contactId)

    const metadata = JSON.parse(action.metadata || '{}')
    const deadline = metadata.deadline
      ? metadata.deadline * 60 * 1000 // deadline is in minutes
      : 2 * 60 * 60 * 1000 // default 2h
    const isExpired = now.getTime() - action.createdAt.getTime() > deadline

    if (!isExpired) continue

    // Check if user already executed an action after this recommendation
    const userAction = await db.engineEvent.findFirst({
      where: {
        contactId: action.contactId,
        type: { in: ['ACTION_EXECUTED', 'ACTION_OUTCOME'] },
        createdAt: { gte: action.createdAt },
      },
    })

    if (userAction) continue // User already acted, skip

    // Auto-trigger the escalation action
    const ifNotMet = metadata.ifNotMet || 'SEND_FOLLOW_UP'

    // ── GUARD: Route action by current score/temperature ──────────────────
    // SEND_AGGRESSIVE_FOLLOWUP is only valid for warm/hot leads (score ≥ 40).
    // Cold leads (score < 20 OR temp = cold) are skipped entirely.
    // Warm-but-not-hot leads get a regular SEND_FOLLOW_UP instead.
    let effectiveAction = ifNotMet
    if (['SEND_AGGRESSIVE_FOLLOWUP', 'SEND_FOLLOW_UP', 'REACTIVATE'].includes(ifNotMet)) {
      const currentContact = await db.contact.findUnique({
        where: { id: action.contactId },
        select: { leadScore: true, temperature: true },
      })
      const currentScore = currentContact?.leadScore ?? (action.score ?? 0)
      const currentTemp = (currentContact?.temperature ?? action.temperature ?? 'cold') as string

      if (currentScore < 20 || currentTemp === 'cold') {
        // Cold lead — skip aggressive/follow-up, no penalty
        console.log(
          `[AutoAction] Skipped ${ifNotMet} — cold lead ${action.contactId}` +
          ` (score:${currentScore}, temp:${currentTemp})`
        )
        continue
      }
      if (ifNotMet === 'SEND_AGGRESSIVE_FOLLOWUP' && currentScore < 40) {
        // Warm but not hot — downgrade to normal follow-up
        effectiveAction = 'SEND_FOLLOW_UP'
        console.log(`[AutoAction] Downgraded to SEND_FOLLOW_UP (score:${currentScore} < 40)`)
      }

      // ── GUARD: 48h cooldown — skip if a follow-up was already fired recently ──
      const FORTY_EIGHT_HOURS_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000)
      const recentFollowUp = await db.engineEvent.findFirst({
        where: {
          contactId: action.contactId,
          type: 'AUTO_ACTION_TRIGGERED',
          createdAt: { gte: FORTY_EIGHT_HOURS_AGO },
        },
      })
      if (recentFollowUp) {
        console.log(
          `[AutoAction] Skipped ${effectiveAction} — 48h cooldown active for ${action.contactId}` +
          ` (last: ${recentFollowUp.createdAt.toISOString()})`
        )
        continue
      }

      // Max 3 auto follow-ups per lead lifetime — prevent infinite escalation chains
      const totalAutoFollowUps = await db.engineEvent.count({
        where: {
          contactId: action.contactId,
          type: 'AUTO_ACTION_TRIGGERED',
        },
      })
      if (totalAutoFollowUps >= 3) {
        console.log(`[AutoAction] Skipped — max 3 auto actions reached for ${action.contactId}`)
        continue
      }
    }

    await db.engineEvent.create({
      data: {
        workspaceId: action.workspaceId,
        contactId: action.contactId,
        type: 'AUTO_ACTION_TRIGGERED',
        subType: effectiveAction,
        metadata: JSON.stringify({
          originalAction: metadata.action,
          escalatedTo: effectiveAction,
          reason: 'Deadline expirado sin acción del usuario',
          triggeredAt: now.toISOString(),
        }),
        score: action.score,
        temperature: action.temperature,
      },
    })

    // Update contact score (penalty for inaction)
    const contact = await db.contact.findUnique({
      where: { id: action.contactId },
    })

    if (contact) {
      const newScore = Math.max(0, (contact.leadScore || 0) - 10)
      const newTemperature = newScore >= 60 ? 'hot' : newScore >= 30 ? 'warm' : 'cold'
      await db.contact.update({
        where: { id: action.contactId },
        data: { leadScore: newScore, temperature: newTemperature },
      })

      await db.engineEvent.create({
        data: {
          workspaceId: action.workspaceId,
          contactId: action.contactId,
          type: 'SCORE_UPDATED',
          metadata: JSON.stringify({
            reason: 'Decay por inacción automática',
            delta: -10,
          }),
          score: newScore,
          temperature: newTemperature,
        },
      })
    }

    triggeredCount++
    console.log(
      `[AutoAction] Triggered ${ifNotMet} for ${action.contactId} (deadline expired)`
    )
  }

  return triggeredCount
}

/**
 * Detect NO_RESPONSE outcomes for outbound messages.
 * After 2h without reply → NO_RESPONSE_2H
 * After 24h without reply → NO_RESPONSE_24H
 */
export async function detectNoResponseOutcomes() {
  const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const TWENTY_FOUR_HOURS_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000)
  let detectedCount = 0

  // Find contacts where last message was outbound and no response in 2h
  const recentOutbound = await db.message.findMany({
    where: {
      direction: 'outbound',
      createdAt: {
        lte: TWO_HOURS_AGO,
        gte: TWENTY_FOUR_HOURS_AGO,
      },
    },
    distinct: ['conversationId'],
    include: { conversation: true },
  })

  for (const msg of recentOutbound) {
    if (!msg.conversation?.contactId) continue

    // Check if there's been any inbound message since
    const hasResponse = await db.message.findFirst({
      where: {
        conversationId: msg.conversationId,
        direction: 'inbound',
        createdAt: { gte: msg.createdAt },
      },
    })

    if (hasResponse) continue

    const hoursSince =
      (Date.now() - msg.createdAt.getTime()) / (1000 * 60 * 60)
    const outcomeType =
      hoursSince >= 24 ? 'NO_RESPONSE_24H' : 'NO_RESPONSE_2H'

    // Check if already recorded for this conversation
    const existing = await db.engineEvent.findFirst({
      where: {
        contactId: msg.conversation.contactId,
        type: 'ACTION_OUTCOME',
        subType: outcomeType,
        createdAt: { gte: msg.createdAt },
      },
    })

    if (existing) continue

    // Skip contacts with a confirmed upcoming appointment (no point flagging inactivity)
    const upcomingAppt = await db.appointment.findFirst({
      where: {
        contactId: msg.conversation.contactId,
        status: 'pending',
        date: { gte: new Date() },
      },
    })
    if (upcomingAppt) {
      console.log(`[AutoAction] Skipping ${outcomeType} — contact ${msg.conversation.contactId} has upcoming appointment`)
      continue
    }

    await db.engineEvent.create({
      data: {
        workspaceId: msg.conversation.workspaceId,
        contactId: msg.conversation.contactId,
        type: 'ACTION_OUTCOME',
        subType: outcomeType,
        metadata: JSON.stringify({
          messageSentAt: msg.createdAt.toISOString(),
          hoursElapsed: Math.round(hoursSince),
          detectedAt: new Date().toISOString(),
        }),
      },
    })

    detectedCount++
    console.log(
      `[AutoAction] Detected ${outcomeType} for contact ${msg.conversation.contactId}`
    )
  }

  return detectedCount
}
