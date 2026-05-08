// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Trust Engine — Damage ×1.5 accumulation, repair ×0.3 recovery
//
// Trust is the foundation of the human-AI relationship.
// Damage accumulates 1.5× faster than it repairs (0.3×).
// This asymmetry reflects how trust works in human relationships:
//   - One betrayal can destroy months of built trust
//   - Repair requires sustained, consistent positive behavior
//
// Trust events:
//   - damage: negative interaction, broken promise, failure
//   - repair: positive interaction, kept promise, consistency
//   - milestone: trust-building achievement (100 kept promises, etc.)
//   - betrayal: severe violation of core values or boundaries
//   - consistency_violation: acted inconsistently with stated values
//   - promise_kept: fulfilled a commitment
//   - promise_broken: failed to fulfill a commitment
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { PersonaKernel } from './persona-kernel'
import {
  type TrustEventType,
  type TrustComputation,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'TRUST_ENGINE'

// ─── Trust Multipliers ──────────────────────────────────────────

const TRUST_MULTIPLIERS: Record<TrustEventType, number> = {
  // Damage events (negative)
  damage: -1.0,
  betrayal: -3.0,                 // Severe — almost irreversible
  consistency_violation: -1.5,
  promise_broken: -2.0,

  // Repair events (positive)
  repair: 1.0,
  milestone: 1.5,
  promise_kept: 1.2,
}

// ─── Severity by Event Type ────────────────────────────────────

const DEFAULT_SEVERITY: Record<TrustEventType, number> = {
  damage: 0.5,
  repair: 0.3,
  milestone: 0.7,
  betrayal: 1.0,
  consistency_violation: 0.6,
  promise_kept: 0.4,
  promise_broken: 0.8,
}

// ═══════════════════════════════════════════════════════════════
// TrustEngine
// ═══════════════════════════════════════════════════════════════

export class TrustEngine {

  // ─────────────────────────────────────────────────────────
  // 1. RECORD EVENT — The main entry point
  // Records a trust event and computes the resulting trust change.
  // ─────────────────────────────────────────────────────────

  static async recordEvent(
    workspaceId: string,
    event: {
      type: TrustEventType
      severity?: number         // 0.0–1.0, overrides default
      description: string
      contactId?: string
      sessionId?: string
      correlationId?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<TrustComputation> {
    logInfo(TAG, 'record_event_start', {
      workspaceId,
      eventType: event.type,
      severity: event.severity,
    })

    try {
      // ── Get kernel ──
      const kernel = await PersonaKernel.get(workspaceId)
      if (!kernel) {
        throw new Error(`No Persona Kernel for workspace ${workspaceId}`)
      }

      const { kernelId } = kernel

      // ── Get current trust score ──
      const latestRecord = await db.trustRecord.findFirst({
        where: { workspaceId, kernelId },
        orderBy: { createdAt: 'desc' },
        select: { trustAfter: true },
      })

      const trustBefore = latestRecord?.trustAfter ?? COGNITIVE_DEFAULTS.TRUST.initialTrust

      // ── Compute trust change ──
      const severity = event.severity ?? DEFAULT_SEVERITY[event.type]
      const baseMultiplier = TRUST_MULTIPLIERS[event.type]

      // Asymmetric computation:
      // Damage: delta = baseMultiplier × severity × 1.5 (accumulates faster)
      // Repair: delta = baseMultiplier × severity × 0.3 (recovers slower)
      const isDamage = baseMultiplier < 0
      const asymmetryMultiplier = isDamage
        ? COGNITIVE_DEFAULTS.TRUST.damageMultiplier  // 1.5
        : COGNITIVE_DEFAULTS.TRUST.repairMultiplier   // 0.3

      const rawDelta = baseMultiplier * severity * asymmetryMultiplier * 0.1

      // Clamp delta to prevent extreme single-event changes
      const maxSingleEventDelta = 0.25
      const clampedDelta = Math.max(-maxSingleEventDelta, Math.min(maxSingleEventDelta, rawDelta))

      // Apply delta
      const trustAfter = Math.max(
        COGNITIVE_DEFAULTS.TRUST.minTrust,
        Math.min(COGNITIVE_DEFAULTS.TRUST.maxTrust, trustBefore + clampedDelta),
      )

      const actualDelta = trustAfter - trustBefore

      // ── Persist trust record ──
      const record = await db.trustRecord.create({
        data: {
          workspaceId,
          kernelId,
          eventType: event.type,
          eventSeverity: severity,
          description: event.description,
          trustBefore,
          trustAfter: Math.round(trustAfter * 1000) / 1000,
          delta: Math.round(actualDelta * 1000) / 1000,
          contactId: event.contactId ?? null,
          sessionId: event.sessionId ?? null,
          correlationId: event.correlationId ?? null,
          metadata: JSON.stringify(event.metadata ?? {}),
        },
      })

      // ── Emit event ──
      try {
        await eventBus.emit(COGNITIVE_EVENTS.TRUST_EVENT, {
          workspaceId,
          kernelId,
          eventType: event.type,
          trustBefore,
          trustAfter,
          delta: actualDelta,
          severity,
          recordId: record.id,
        } as Record<string, unknown>, TAG)
      } catch {
        // Non-critical
      }

      // ── Log significant trust changes ──
      if (Math.abs(actualDelta) > 0.05) {
        const direction = actualDelta > 0 ? 'REPAIRED' : 'DAMAGED'
        logWarn(TAG, `trust_${direction.toLowerCase()}`, {
          workspaceId,
          kernelId,
          eventType: event.type,
          trustBefore: trustBefore.toFixed(3),
          trustAfter: trustAfter.toFixed(3),
          delta: actualDelta.toFixed(3),
        })
      }

      logOk(TAG, 'record_event_complete', {
        workspaceId,
        kernelId,
        eventType: event.type,
        trustBefore: trustBefore.toFixed(3),
        trustAfter: trustAfter.toFixed(3),
        delta: actualDelta.toFixed(3),
        multiplier: asymmetryMultiplier,
      })

      return {
        trustBefore,
        trustAfter,
        delta: actualDelta,
        eventType: event.type,
        severity,
        multiplier: asymmetryMultiplier,
      }
    } catch (err) {
      logError(TAG, 'record_event_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET CURRENT TRUST — Returns the latest trust score
  // ─────────────────────────────────────────────────────────

  static async getCurrentTrust(
    workspaceId: string,
  ): Promise<{
    score: number
    trend: string
    recentEvents: number
    lastEventAt: Date | null
    lastEventType: string | null
    eventHistory: Array<{
      type: string
      severity: number
      delta: number
      trustBefore: number
      trustAfter: number
      createdAt: Date
      description: string
    }>
  }> {
    const kernel = await PersonaKernel.get(workspaceId)
    if (!kernel) {
      return {
        score: COGNITIVE_DEFAULTS.TRUST.initialTrust,
        trend: 'stable',
        recentEvents: 0,
        lastEventAt: null,
        lastEventType: null,
        eventHistory: [],
      }
    }

    const [latest, recentEvents, recentRecords] = await Promise.all([
      db.trustRecord.findFirst({
        where: { workspaceId, kernelId: kernel.kernelId },
        orderBy: { createdAt: 'desc' },
      }),
      db.trustRecord.count({
        where: {
          workspaceId,
          kernelId: kernel.kernelId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) },
        },
      }),
      db.trustRecord.findMany({
        where: { workspaceId, kernelId: kernel.kernelId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          eventType: true,
          eventSeverity: true,
          delta: true,
          trustBefore: true,
          trustAfter: true,
          createdAt: true,
          description: true,
        },
      }),
    ])

    const score = latest?.trustAfter ?? COGNITIVE_DEFAULTS.TRUST.initialTrust

    // Compute trend from recent records
    let trend = 'stable'
    if (recentRecords.length >= 3) {
      const recentDeltas = recentRecords.slice(0, 3).map((r) => r.delta)
      const avgDelta = recentDeltas.reduce((sum, d) => sum + d, 0) / recentDeltas.length
      if (avgDelta > 0.01) trend = 'improving'
      else if (avgDelta < -0.01) trend = 'degrading'
      else {
        const hasPos = recentDeltas.some((d) => d > 0.005)
        const hasNeg = recentDeltas.some((d) => d < -0.005)
        if (hasPos && hasNeg) trend = 'volatile'
      }
    }

    return {
      score,
      trend,
      recentEvents,
      lastEventAt: latest?.createdAt ?? null,
      lastEventType: latest?.eventType ?? null,
      eventHistory: recentRecords.map((r) => ({
        type: r.eventType,
        severity: r.eventSeverity,
        delta: r.delta,
        trustBefore: r.trustBefore,
        trustAfter: r.trustAfter,
        createdAt: r.createdAt,
        description: r.description,
      })),
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. AUTO REPAIR — Background trust repair
  // Gradually recovers trust when the system has been consistent.
  // Only works when there are no recent damage events.
  // ─────────────────────────────────────────────────────────

  static async autoRepair(
    workspaceId: string,
  ): Promise<{
    repaired: boolean
    trustBefore: number
    trustAfter: number
    reason: string
  }> {
    logInfo(TAG, 'auto_repair_start', { workspaceId })

    try {
      const trustState = await TrustEngine.getCurrentTrust(workspaceId)
      const kernel = await PersonaKernel.get(workspaceId)

      if (!kernel) {
        return { repaired: false, trustBefore: 0, trustAfter: 0, reason: 'No kernel found' }
      }

      const trustBefore = trustState.score

      // ── Check if auto-repair is appropriate ──
      // Only repair if trust is below auto-repair threshold
      if (trustBefore >= COGNITIVE_DEFAULTS.TRUST.autoRepairThreshold) {
        return {
          repaired: false,
          trustBefore,
          trustAfter: trustBefore,
          reason: `Trust (${trustBefore.toFixed(3)}) is above auto-repair threshold (${COGNITIVE_DEFAULTS.TRUST.autoRepairThreshold}). No repair needed.`,
        }
      }

      // ── Check for recent damage events ──
      const recentDamage = await db.trustRecord.count({
        where: {
          workspaceId,
          kernelId: kernel.kernelId,
          eventType: { in: ['damage', 'betrayal', 'consistency_violation', 'promise_broken'] },
          createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) }, // last 24h
        },
      })

      if (recentDamage > 0) {
        return {
          repaired: false,
          trustBefore,
          trustAfter: trustBefore,
          reason: `Cannot auto-repair: ${recentDamage} recent damage event(s) in the last 24 hours. Repair requires sustained consistency.`,
        }
      }

      // ── Apply gradual repair ──
      // Repair amount is very small (0.3 × base)
      const repairAmount = 0.02 * COGNITIVE_DEFAULTS.TRUST.repairMultiplier
      const trustAfter = Math.min(
        COGNITIVE_DEFAULTS.TRUST.maxTrust,
        trustBefore + repairAmount,
      )

      // Record the repair event
      await db.trustRecord.create({
        data: {
          workspaceId,
          kernelId: kernel.kernelId,
          eventType: 'repair',
          eventSeverity: 0.1, // Low severity — natural recovery
          description: 'Automated trust repair: consistent behavior over 24 hours with no damage events.',
          trustBefore,
          trustAfter: Math.round(trustAfter * 1000) / 1000,
          delta: Math.round((trustAfter - trustBefore) * 1000) / 1000,
          isAutoRepaired: true,
        },
      })

      logOk(TAG, 'auto_repair_complete', {
        workspaceId,
        trustBefore: trustBefore.toFixed(3),
        trustAfter: trustAfter.toFixed(3),
      })

      return {
        repaired: true,
        trustBefore,
        trustAfter: Math.round(trustAfter * 1000) / 1000,
        reason: `Auto-repair applied (+${((trustAfter - trustBefore) * 100).toFixed(2)}%). Trust is recovering through consistent behavior.`,
      }
    } catch (err) {
      logError(TAG, 'auto_repair_error', err, { workspaceId })
      return { repaired: false, trustBefore: 0, trustAfter: 0, reason: 'Auto-repair failed' }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. GET TRUST STATISTICS — Aggregate trust metrics
  // ─────────────────────────────────────────────────────────

  static async getStatistics(
    workspaceId: string,
    kernelId?: string,
  ): Promise<{
    currentTrust: number
    totalEvents: number
    damageEvents: number
    repairEvents: number
    betrayalEvents: number
    promiseKeptEvents: number
    promiseBrokenEvents: number
    avgDamageDelta: number
    avgRepairDelta: number
    worstEvent: string | null
    bestEvent: string | null
    trustRange: { min: number; max: number }
  }> {
    const kernel = kernelId ? { kernelId } : (await PersonaKernel.get(workspaceId))
      ? { kernelId: (await PersonaKernel.get(workspaceId))!.kernelId } : null

    if (!kernel) {
      return {
        currentTrust: COGNITIVE_DEFAULTS.TRUST.initialTrust,
        totalEvents: 0,
        damageEvents: 0,
        repairEvents: 0,
        betrayalEvents: 0,
        promiseKeptEvents: 0,
        promiseBrokenEvents: 0,
        avgDamageDelta: 0,
        avgRepairDelta: 0,
        worstEvent: null,
        bestEvent: null,
        trustRange: { min: 0.5, max: 0.5 },
      }
    }

    const records = await db.trustRecord.findMany({
      where: { workspaceId, kernelId: kernel.kernelId },
      select: {
        eventType: true,
        delta: true,
        trustAfter: true,
        description: true,
      },
    })

    const damageRecords = records.filter((r) =>
      ['damage', 'betrayal', 'consistency_violation', 'promise_broken'].includes(r.eventType),
    )
    const repairRecords = records.filter((r) =>
      ['repair', 'milestone', 'promise_kept'].includes(r.eventType),
    )

    const avgDamageDelta = damageRecords.length > 0
      ? damageRecords.reduce((sum, r) => sum + r.delta, 0) / damageRecords.length
      : 0

    const avgRepairDelta = repairRecords.length > 0
      ? repairRecords.reduce((sum, r) => sum + r.delta, 0) / repairRecords.length
      : 0

    // Find worst and best events
    const sorted = [...records].sort((a, b) => a.delta - b.delta)
    const worstEvent = sorted[0]?.description ?? null
    const bestEvent = sorted[sorted.length - 1]?.description ?? null

    // Trust range
    const allTrustScores = records.map((r) => r.trustAfter)
    const minTrust = allTrustScores.length > 0 ? Math.min(...allTrustScores) : 0.5
    const maxTrust = allTrustScores.length > 0 ? Math.max(...allTrustScores) : 0.5

    const currentTrust = records.length > 0
      ? records[records.length - 1].trustAfter
      : COGNITIVE_DEFAULTS.TRUST.initialTrust

    return {
      currentTrust,
      totalEvents: records.length,
      damageEvents: damageRecords.length,
      repairEvents: repairRecords.length,
      betrayalEvents: records.filter((r) => r.eventType === 'betrayal').length,
      promiseKeptEvents: records.filter((r) => r.eventType === 'promise_kept').length,
      promiseBrokenEvents: records.filter((r) => r.eventType === 'promise_broken').length,
      avgDamageDelta: Math.round(avgDamageDelta * 1000) / 1000,
      avgRepairDelta: Math.round(avgRepairDelta * 1000) / 1000,
      worstEvent,
      bestEvent,
      trustRange: { min: Math.round(minTrust * 1000) / 1000, max: Math.round(maxTrust * 1000) / 1000 },
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default TrustEngine
