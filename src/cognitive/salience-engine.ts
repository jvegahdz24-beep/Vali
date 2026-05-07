// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Salience Engine — Scores what deserves cognitive attention
// Not everything is equally important. Salience determines what
// the system should focus on by computing priority scores from
// multiple weighted factors: urgency, importance, recency, emotional.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError } from '@/lib/logger'
import {
  type PromisePriorityFactors,
  type CognitiveGoal,
  type FocusType,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'
import { eventBus } from '@/lib/event-bus'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'SALIENCE_ENGINE'

// ─── Salience Factor Weights ───────────────────────────────────
// These weights determine how much each factor contributes to the
// overall salience score. They can be tuned per deployment.

const SALIENCE_WEIGHTS = {
  // Promise salience
  urgency: 0.30,      // Time-criticality (deadline proximity)
  importance: 0.35,   // Relationship impact
  freshness: 0.20,    // How recently the promise was made
  emotional: 0.15,    // Emotional intensity attached

  // General salience
  recency: 0.25,      // How recent the event is
  frequency: 0.20,    // How often this type of event occurs
  emotionalIntensity: 0.30, // Emotional charge
  explicitPriority: 0.25,   // User/system-assigned priority

  // Focus type base salience
  focusTypeBase: {
    conversation: 0.80,
    task: 0.60,
    promise: 0.90,
    emotion: 0.70,
    learning: 0.40,
    system: 0.30,
    none: 0.10,
  } as Record<string, number>,
} as const

// ═══════════════════════════════════════════════════════════════
// SalienceEngine
// ═══════════════════════════════════════════════════════════════

export class SalienceEngine {

  // ─────────────────────────────────────────────────────────
  // 1. SCORE PROMISE
  // Computes the full priority score for an unresolved promise.
  // This is the composite of urgency, importance, freshness, and emotional factors.
  // ─────────────────────────────────────────────────────────

  static scorePromise(
    promise: {
      promisedAt: Date
      deadline: Date | null
      urgencyFactor: number
      importanceFactor: number
      freshnessFactor: number
      contactId: string | null
      escalated: boolean
      reminderCount: number
    },
  ): PromisePriorityFactors {
    const now = Date.now()

    // ── Urgency: Based on deadline proximity ──
    let urgency = promise.urgencyFactor
    if (promise.deadline) {
      const msUntilDeadline = promise.deadline.getTime() - now
      const hoursUntil = msUntilDeadline / 3_600_000

      if (msUntilDeadline <= 0) {
        urgency = 1.0 // Past deadline — maximum urgency
      } else if (hoursUntil <= 1) {
        urgency = Math.max(urgency, 0.95)
      } else if (hoursUntil <= 6) {
        urgency = Math.max(urgency, 0.80)
      } else if (hoursUntil <= 24) {
        urgency = Math.max(urgency, 0.60)
      } else if (hoursUntil <= 72) {
        urgency = Math.max(urgency, 0.40)
      } else {
        urgency = Math.max(urgency, 0.20)
      }
    }

    // ── Importance: Base importance + escalation bonus + reminder penalty ──
    let importance = promise.importanceFactor
    if (promise.escalated) importance = Math.min(1.0, importance + 0.3)
    if (promise.reminderCount > 0) importance = Math.min(1.0, importance + 0.1 * Math.min(promise.reminderCount, 3))

    // ── Freshness: Decays over time ──
    const hoursSincePromise = (now - promise.promisedAt.getTime()) / 3_600_000
    const freshness = Math.max(
      0.1,
      promise.freshnessFactor - (hoursSincePromise * COGNITIVE_DEFAULTS.PROMISE.freshnessDecayPerHour),
    )

    // ── Emotional: Higher for contact-specific promises ──
    const emotional = promise.contactId ? 0.7 : 0.3

    // ── Composite: Weighted sum ──
    const composite =
      urgency * SALIENCE_WEIGHTS.urgency +
      importance * SALIENCE_WEIGHTS.importance +
      freshness * SALIENCE_WEIGHTS.freshness +
      emotional * SALIENCE_WEIGHTS.emotional

    return {
      urgency: Math.round(urgency * 1000) / 1000,
      importance: Math.round(importance * 1000) / 1000,
      freshness: Math.round(freshness * 1000) / 1000,
      composite: Math.min(1.0, Math.max(0.0, Math.round(composite * 1000) / 1000)),
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. SCORE GOAL
  // Computes salience for a cognitive goal.
  // Goals closer to deadline with higher priority are more salient.
  // ─────────────────────────────────────────────────────────

  static scoreGoal(goal: CognitiveGoal): number {
    const now = Date.now()

    // Base priority
    let salience = goal.priority

    // Deadline urgency boost
    if (goal.deadline) {
      const msUntilDeadline = goal.deadline.getTime() - now
      const hoursUntil = msUntilDeadline / 3_600_000

      if (msUntilDeadline <= 0) {
        salience *= 1.5 // Overdue goals are very salient
      } else if (hoursUntil <= 6) {
        salience *= 1.3
      } else if (hoursUntil <= 24) {
        salience *= 1.15
      }
    }

    // Incomplete goals are more salient than complete ones
    if (goal.progress < 0.5) {
      salience *= 1.1
    }

    // Source weighting: user-assigned goals > system-inferred > inferred
    const sourceMultiplier = {
      user: 1.2,
      system: 1.0,
      inferred: 0.8,
    }
    salience *= sourceMultiplier[goal.source] ?? 1.0

    return Math.min(1.0, salience)
  }

  // ─────────────────────────────────────────────────────────
  // 3. SCORE EMOTIONAL EVENT
  // Computes salience for an emotional signal.
  // High arousal + high valence extremes = more salient.
  // ─────────────────────────────────────────────────────────

  static scoreEmotionalEvent(
    valence: number,    // -1.0 to 1.0
    arousal: number,    // 0.0 to 1.0
    isUserDirected: boolean = false,
  ): number {
    // Extreme emotions (both positive and negative) are more salient
    const valenceSalience = Math.abs(valence)
    const arousalSalience = arousal

    // User-directed emotions are more salient than ambient
    const directionMultiplier = isUserDirected ? 1.3 : 1.0

    const raw = (
      valenceSalience * 0.4 +
      arousalSalience * 0.6
    ) * directionMultiplier

    return Math.min(1.0, raw)
  }

  // ─────────────────────────────────────────────────────────
  // 4. RANK PROMISES
  // Returns all active promises ranked by salience score.
  // ─────────────────────────────────────────────────────────

  static async rankPromises(
    workspaceId: string,
  ): Promise<Array<{
    promiseId: string
    promiseText: string
    salience: number
    factors: PromisePriorityFactors
    status: string
    deadline: Date | null
  }>> {
    try {
      const promises = await db.unresolvedPromise.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'in_progress'] },
        },
        orderBy: { priorityScore: 'desc' },
      })

      const scored = promises.map((p) => {
        const factors = SalienceEngine.scorePromise({
          promisedAt: p.promisedAt,
          deadline: p.deadline,
          urgencyFactor: p.urgencyFactor,
          importanceFactor: p.importanceFactor,
          freshnessFactor: p.freshnessFactor,
          contactId: p.contactId,
          escalated: p.escalated,
          reminderCount: p.reminderCount,
        })

        return {
          promiseId: p.id,
          promiseText: p.promiseText,
          salience: factors.composite,
          factors,
          status: p.status,
          deadline: p.deadline,
        }
      })

      // Sort by composite salience descending
      scored.sort((a, b) => b.salience - a.salience)

      return scored
    } catch (err) {
      logError(TAG, 'rank_promises_error', err, { workspaceId })
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. RANK GOALS
  // Returns goals ranked by salience score.
  // ─────────────────────────────────────────────────────────

  static rankGoals(goals: CognitiveGoal[]): Array<{
    goal: CognitiveGoal
    salience: number
  }> {
    return goals
      .map((goal) => ({
        goal,
        salience: SalienceEngine.scoreGoal(goal),
      }))
      .sort((a, b) => b.salience - a.salience)
  }

  // ─────────────────────────────────────────────────────────
  // 6. GET SALIENCE THRESHOLD
  // Returns the minimum salience score for something to be
  // considered "attention-worthy" given current cognitive load.
  // Under high load, the threshold rises (only the most salient
  // items get attention).
  // ─────────────────────────────────────────────────────────

  static getSalienceThreshold(cognitiveLoad: number): number {
    if (cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.overloadThreshold) {
      return 0.80 // Only critical items when overloaded
    }
    if (cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.highThreshold) {
      return 0.60 // Important items only
    }
    if (cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.moderateThreshold) {
      return 0.40 // Moderate filtering
    }
    return 0.20 // Light filtering when load is optimal
  }

  // ─────────────────────────────────────────────────────────
  // 7. UPDATE PROMISE SALIENCE (batch)
  // Recomputes and persists salience scores for all active
  // promises in a workspace. Called by background cognition.
  // ─────────────────────────────────────────────────────────

  static async updatePromiseSalience(
    workspaceId: string,
  ): Promise<{
    updated: number
    critical: number
    topPromise: string | null
  }> {
    logInfo(TAG, 'update_promise_salience_start', { workspaceId })

    try {
      const promises = await db.unresolvedPromise.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'in_progress'] },
        },
      })

      let updated = 0
      let critical = 0
      let topSalience = 0
      let topPromiseId: string | null = null

      for (const promise of promises) {
        const factors = SalienceEngine.scorePromise({
          promisedAt: promise.promisedAt,
          deadline: promise.deadline,
          urgencyFactor: promise.urgencyFactor,
          importanceFactor: promise.importanceFactor,
          freshnessFactor: promise.freshnessFactor,
          contactId: promise.contactId,
          escalated: promise.escalated,
          reminderCount: promise.reminderCount,
        })

        await db.unresolvedPromise.update({
          where: { id: promise.id },
          data: {
            urgencyFactor: factors.urgency,
            importanceFactor: factors.importance,
            freshnessFactor: factors.freshness,
            priorityScore: factors.composite,
          },
        })

        updated++
        if (factors.composite >= 0.80) critical++
        if (factors.composite > topSalience) {
          topSalience = factors.composite
          topPromiseId = promise.id
        }
      }

      logOk(TAG, 'update_promise_salience_complete', {
        workspaceId,
        updated,
        critical,
      })

      return { updated, critical, topPromise: topPromiseId }
    } catch (err) {
      logError(TAG, 'update_promise_salience_error', err, { workspaceId })
      return { updated: 0, critical: 0, topPromise: null }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 8. COMPUTE FOCUS TYPE SALIENCE
  // Returns the base salience for a given focus type.
  // ─────────────────────────────────────────────────────────

  static getFocusTypeSalience(type: FocusType): number {
    return SALIENCE_WEIGHTS.focusTypeBase[type] ?? 0.5
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default SalienceEngine
