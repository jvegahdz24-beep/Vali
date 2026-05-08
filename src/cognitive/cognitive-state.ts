// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Cognitive State Manager — STATE SYNTHESIS ENGINE (NOT state storage)
// Synthesizes emergent operational state from multiple signal sources.
// Does NOT create its own data — reads from existing subsystems and
// produces a unified SynthesizedCognitiveState snapshot.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { PersonaKernel } from './persona-kernel'
import { CoherenceSnapshots } from './coherence-snapshots'
import {
  type SynthesizedCognitiveState,
  type CognitiveGoal,
  type LoadFactors,
  type EmotionalVelocity,
  type TrustTrend,
  type TemporalPressure,
  type TimeHorizon,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'COGNITIVE_STATE'
const CACHE_NAMESPACE = 'cognitive:state'
const CACHE_TTL_SECONDS = 300 // 5 minutes (state is volatile, don't cache too long)

// ═══════════════════════════════════════════════════════════════
// CognitiveStateManager
// ═══════════════════════════════════════════════════════════════

export class CognitiveStateManager {

  // ─────────────────────────────────────────────────────────
  // 1. SYNTHESIZE — Main entry point
  // Gathers signals from all subsystems and produces a unified
  // cognitive state. This is a READ-ONLY synthesis operation.
  // The state is emergent — not stored, computed.
  // ─────────────────────────────────────────────────────────

  static async synthesize(
    workspaceId: string,
    options?: {
      sessionId?: string
      contactId?: string
      force?: boolean // bypass cache
    },
  ): Promise<SynthesizedCognitiveState> {
    const timerStart = Date.now()
    logInfo(TAG, 'synthesize_start', { workspaceId, sessionId: options?.sessionId })

    try {
      // ── Step 1: Get Persona Kernel (identity foundation) ──
      const kernel = await PersonaKernel.get(workspaceId)
      if (!kernel) {
        throw new Error(`No Persona Kernel for workspace ${workspaceId}. Cannot synthesize state without identity.`)
      }

      const { kernelId, behavioral, driftConfig } = kernel

      // ── Step 2: Gather all signal sources in parallel ──
      const [
        coherenceData,
        trustData,
        emotionalData,
        promiseData,
        loadData,
        focusData,
      ] = await Promise.allSettled([
        // Coherence: latest assessment from CoherenceSnapshots
        CoherenceSnapshots.getLatest(workspaceId),

        // Trust: compute from TrustRecord history
        CognitiveStateManager.gatherTrustSignals(workspaceId, kernelId),

        // Emotional: latest EmotionalMomentum
        CognitiveStateManager.gatherEmotionalSignals(workspaceId),

        // Promises: active unresolved promises → goals
        CognitiveStateManager.gatherPromiseSignals(workspaceId),

        // Load: compute cognitive load from active operations
        CognitiveStateManager.gatherLoadSignals(workspaceId),

        // Focus: current attentional focus
        CognitiveStateManager.gatherFocusSignals(workspaceId),
      ])

      // ── Step 3: Extract data with fallbacks ──
      const coherence = coherenceData.status === 'fulfilled' ? coherenceData.value : null
      const trust = trustData.status === 'fulfilled' ? trustData.value : null
      const emotional = emotionalData.status === 'fulfilled' ? emotionalData.value : null
      const promises = promiseData.status === 'fulfilled' ? promiseData.value : []
      const load = loadData.status === 'fulfilled' ? loadData.value : CognitiveStateManager.defaultLoadFactors()
      const focus = focusData.status === 'fulfilled' ? focusData.value : null

      // ── Step 4: Compute attentional focus ──
      const conversationalFocus = {
        activeTopic: focus?.focusTarget ?? null,
        depth: focus?.focusIntensity ?? 0.5,
        salience: focus ? CognitiveStateManager.computeSalience(focus.focusType, focus.focusIntensity) : 0.5,
      }

      // ── Step 5: Derive active goals from promises + system goals ──
      const activeGoals: CognitiveGoal[] = promises.map((p) => ({
        id: p.id,
        description: p.promiseText,
        priority: p.priorityScore,
        deadline: p.deadline,
        progress: p.status === 'in_progress' ? 0.5 : p.status === 'fulfilled' ? 1.0 : 0.0,
        source: 'inferred' as const,
        createdAt: p.promisedAt,
      }))

      // ── Step 6: Compute cognitive load score ──
      const cognitiveLoad = CognitiveStateManager.computeLoadScore(load)

      // ── Step 7: Determine temporal pressure ──
      const temporalPressure = CognitiveStateManager.computeTemporalPressure(promises)

      // ── Step 8: Determine time horizon ──
      const timeHorizon = CognitiveStateManager.computeTimeHorizon(temporalPressure, promises)

      // ── Step 9: Determine emotional momentum ──
      const emotionalMomentum = emotional?.velocity ?? 'stable' as EmotionalVelocity

      // ── Step 10: Compute unresolved emotional events ──
      const unresolvedEmotionalEvents = emotional?.unresolvedCount ?? 0

      // ── Step 11: Compute trust landscape ──
      const overallTrust = trust?.currentTrust ?? COGNITIVE_DEFAULTS.TRUST.initialTrust
      const trustTrend = trust?.trend ?? 'stable' as TrustTrend

      // ── Step 12: Compute coherence and drift ──
      const coherenceScore = coherence?.overallCoherence ?? 1.0
      const identityDrift = coherence?.driftMagnitude ?? 0

      // ── Step 13: Determine suppressed goals (when overloaded) ──
      const suppressedGoals: string[] = cognitiveLoad > COGNITIVE_DEFAULTS.LOAD.highThreshold
        ? activeGoals
            .filter((g) => g.priority < 0.5)
            .map((g) => g.id)
        : []

      // ── Step 14: Persist the synthesized state (for audit trail, not primary storage) ──
      await CognitiveStateManager.persistState({
        workspaceId,
        kernelId,
        conversationalFocus,
        activeGoals,
        suppressedGoals,
        cognitiveLoad,
        loadFactors: load,
        temporalPressure,
        timeHorizon,
        emotionalMomentum,
        unresolvedEmotionalEvents,
        overallTrust,
        trustTrend,
        coherenceScore,
        identityDrift,
        sessionId: options?.sessionId,
        contactId: options?.contactId,
      })

      // ── Step 15: Build final state object ──
      const state: SynthesizedCognitiveState = {
        workspaceId,
        kernelId,
        conversationalFocus,
        activeGoals,
        suppressedGoals,
        cognitiveLoad,
        loadFactors: load,
        temporalPressure,
        timeHorizon,
        emotionalMomentum,
        unresolvedEmotionalEvents,
        overallTrust,
        trustTrend,
        coherenceScore,
        identityDrift,
        synthesizedAt: new Date(),
        sourceSnapshotCount: 6,
      }

      const latencyMs = Date.now() - timerStart

      // ── Step 16: Emit state synthesized event ──
      try {
        await eventBus.emit(COGNITIVE_EVENTS.STATE_SYNTHESIZED, {
          workspaceId,
          kernelId,
          cognitiveLoad,
          coherenceScore,
          overallTrust,
          emotionalMomentum,
          latencyMs,
        } as Record<string, unknown>, TAG)
      } catch {
        // Non-critical
      }

      // ── Step 17: Check for overload and emit warning ──
      if (cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.overloadThreshold) {
        try {
          await eventBus.emit(COGNITIVE_EVENTS.LOAD_OVERLOAD, {
            workspaceId,
            kernelId,
            cognitiveLoad,
            loadFactors: load,
            suppressedGoals: suppressedGoals.length,
            activeGoals: activeGoals.length,
          } as Record<string, unknown>, TAG)
        } catch {
          // Non-critical
        }
      }

      logOk(TAG, 'synthesize_complete', {
        workspaceId,
        kernelId,
        cognitiveLoad: cognitiveLoad.toFixed(3),
        coherenceScore: coherenceScore.toFixed(3),
        overallTrust: overallTrust.toFixed(3),
        activeGoals: activeGoals.length,
        suppressedGoals: suppressedGoals.length,
        latencyMs,
      })

      return state
    } catch (err) {
      logError(TAG, 'synthesize_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET LATEST — Returns the most recently synthesized state
  // from the DB audit trail. Does NOT re-synthesize.
  // ─────────────────────────────────────────────────────────

  static async getLatest(
    workspaceId: string,
  ): Promise<SynthesizedCognitiveState | null> {
    const record = await db.cognitiveState.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) return null

    return CognitiveStateManager.recordToState(record)
  }

  // ─────────────────────────────────────────────────────────
  // 3. GET STATE HISTORY — Returns recent synthesized states
  // for trend analysis
  // ─────────────────────────────────────────────────────────

  static async getHistory(
    workspaceId: string,
    limit: number = 30,
  ): Promise<Array<{
    cognitiveLoad: number
    coherenceScore: number
    overallTrust: number
    emotionalMomentum: string
    temporalPressure: string
    synthesizedAt: Date
  }>> {
    const records = await db.cognitiveState.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        cognitiveLoad: true,
        coherenceScore: true,
        overallTrust: true,
        emotionalMomentum: true,
        temporalPressure: true,
        createdAt: true,
      },
    })

    return records.map((r) => ({
      cognitiveLoad: r.cognitiveLoad,
      coherenceScore: r.coherenceScore,
      overallTrust: r.overallTrust,
      emotionalMomentum: r.emotionalMomentum,
      temporalPressure: r.temporalPressure ?? 'none',
      synthesizedAt: r.createdAt,
    }))
  }

  // ─────────────────────────────────────────────────────────
  // 4. IS OVERLOADED — Quick check if the system is in
  // cognitive overload state
  // ─────────────────────────────────────────────────────────

  static async isOverloaded(workspaceId: string): Promise<boolean> {
    const latest = await CognitiveStateManager.getLatest(workspaceId)
    if (!latest) return false

    return latest.cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.overloadThreshold
  }

  // ─────────────────────────────────────────────────────────
  // 5. SHOULD THROTTLE — Determines if new operations should
  // be throttled based on current cognitive state.
  // Returns the recommended throttle level.
  // ─────────────────────────────────────────────────────────

  static async shouldThrottle(
    workspaceId: string,
  ): Promise<{
    shouldThrottle: boolean
    throttleLevel: 'none' | 'light' | 'moderate' | 'heavy'
    reason: string
    cognitiveLoad: number
  }> {
    const state = await CognitiveStateManager.synthesize(workspaceId)

    const load = state.cognitiveLoad

    if (load >= COGNITIVE_DEFAULTS.LOAD.overloadThreshold) {
      return {
        shouldThrottle: true,
        throttleLevel: 'heavy',
        reason: `Cognitive overload (${load.toFixed(3)} >= ${COGNITIVE_DEFAULTS.LOAD.overloadThreshold}). Only critical operations allowed.`,
        cognitiveLoad: load,
      }
    }

    if (load >= COGNITIVE_DEFAULTS.LOAD.highThreshold) {
      return {
        shouldThrottle: true,
        throttleLevel: 'moderate',
        reason: `High cognitive load (${load.toFixed(3)} >= ${COGNITIVE_DEFAULTS.LOAD.highThreshold}). Background tasks paused, user-facing operations prioritized.`,
        cognitiveLoad: load,
      }
    }

    if (load >= COGNITIVE_DEFAULTS.LOAD.moderateThreshold) {
      return {
        shouldThrottle: true,
        throttleLevel: 'light',
        reason: `Moderate cognitive load (${load.toFixed(3)} >= ${COGNITIVE_DEFAULTS.LOAD.moderateThreshold}). Optional tasks deferred.`,
        cognitiveLoad: load,
      }
    }

    return {
      shouldThrottle: false,
      throttleLevel: 'none',
      reason: `Cognitive load optimal (${load.toFixed(3)} < ${COGNITIVE_DEFAULTS.LOAD.moderateThreshold}). Full operation capacity.`,
      cognitiveLoad: load,
    }
  }

  // ─────────────────────────────────────────────────────────
  // SIGNAL GATHERING METHODS
  // Each method reads from one subsystem and returns structured data.
  // If a subsystem is unavailable, it returns a safe default.
  // ─────────────────────────────────────────────────────────

  private static async gatherTrustSignals(
    workspaceId: string,
    kernelId: string,
  ): Promise<{
    currentTrust: number
    trend: TrustTrend
    recentEvents: number
    lastEventAt: Date | null
  } | null> {
    try {
      // Get latest trust record to find current trust score
      const latestRecord = await db.trustRecord.findFirst({
        where: { workspaceId, kernelId },
        orderBy: { createdAt: 'desc' },
        select: { trustAfter: true, createdAt: true },
      })

      const currentTrust = latestRecord?.trustAfter ?? COGNITIVE_DEFAULTS.TRUST.initialTrust

      // Get recent records for trend analysis (last 10)
      const recentRecords = await db.trustRecord.findMany({
        where: {
          workspaceId,
          kernelId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) }, // last 7 days
        },
        orderBy: { createdAt: 'asc' },
        select: { trustAfter: true, delta: true },
        take: 10,
      })

      // Compute trend from recent records
      let trend: TrustTrend = 'stable'
      if (recentRecords.length >= 3) {
        const recentDeltas = recentRecords.slice(-3).map((r) => r.delta)
        const avgDelta = recentDeltas.reduce((sum, d) => sum + d, 0) / recentDeltas.length

        if (avgDelta > 0.02) trend = 'improving'
        else if (avgDelta < -0.02) trend = 'degrading'
        else {
          // Check for volatility (alternating positive/negative)
          const hasPositive = recentDeltas.some((d) => d > 0.01)
          const hasNegative = recentDeltas.some((d) => d < -0.01)
          if (hasPositive && hasNegative) trend = 'volatile'
        }
      }

      const recentCount = await db.trustRecord.count({
        where: {
          workspaceId,
          kernelId,
          createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) },
        },
      })

      return {
        currentTrust,
        trend,
        recentEvents: recentCount,
        lastEventAt: latestRecord?.createdAt ?? null,
      }
    } catch (err) {
      logError(TAG, 'trust_signals_error', err, { workspaceId })
      return null
    }
  }

  private static async gatherEmotionalSignals(
    workspaceId: string,
  ): Promise<{
    primaryEmotion: string
    valence: number
    arousal: number
    velocity: EmotionalVelocity
    momentumScore: number
    unresolvedCount: number
  } | null> {
    try {
      const momentum = await db.emotionalMomentum.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      })

      if (!momentum) return null

      return {
        primaryEmotion: momentum.primaryEmotion,
        valence: momentum.emotionalValence,
        arousal: momentum.emotionalArousal,
        velocity: momentum.emotionalVelocity as EmotionalVelocity,
        momentumScore: momentum.momentumScore,
        unresolvedCount: momentum.emotionalEventsCount,
      }
    } catch (err) {
      logError(TAG, 'emotional_signals_error', err, { workspaceId })
      return null
    }
  }

  private static async gatherPromiseSignals(
    workspaceId: string,
  ): Promise<Array<{
    id: string
    promiseText: string
    promiseType: string
    priorityScore: number
    urgencyFactor: number
    importanceFactor: number
    freshnessFactor: number
    promisedAt: Date
    deadline: Date | null
    status: string
    contactId: string | null
  }>> {
    try {
      const promises = await db.unresolvedPromise.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'in_progress'] },
        },
        orderBy: { priorityScore: 'desc' },
        take: 20, // Limit to top 20 for cognitive feasibility
      })

      return promises.map((p) => ({
        id: p.id,
        promiseText: p.promiseText,
        promiseType: p.promiseType,
        priorityScore: p.priorityScore,
        urgencyFactor: p.urgencyFactor,
        importanceFactor: p.importanceFactor,
        freshnessFactor: p.freshnessFactor,
        promisedAt: p.promisedAt,
        deadline: p.deadline,
        status: p.status,
        contactId: p.contactId,
      }))
    } catch (err) {
      logError(TAG, 'promise_signals_error', err, { workspaceId })
      return []
    }
  }

  static async gatherLoadSignals(
    workspaceId: string,
  ): Promise<LoadFactors> {
    try {
      // Count active cognitive operations in parallel
      const [
        activeConversations,
        pendingActions,
        memoryOps,
        activePromises,
        unresolvedItems,
      ] = await Promise.all([
        // Active conversations (conversations with recent messages)
        db.conversation.count({
          where: {
            workspaceId,
            lastMessageAt: { gte: new Date(Date.now() - 30 * 60_000) }, // last 30 min
          },
        }),

        // Pending actions (unresolved promises + active automations)
        db.unresolvedPromise.count({
          where: { workspaceId, status: { in: ['pending', 'in_progress'] } },
        }),

        // Memory operations (recent episodic memories, rough proxy)
        db.episodicMemory.count({
          where: {
            workspaceId,
            createdAt: { gte: new Date(Date.now() - 5 * 60_000) }, // last 5 min
          },
        }),

        // Active promises
        db.unresolvedPromise.count({
          where: { workspaceId, status: 'in_progress' },
        }),

        // Unresolved items (open items needing attention)
        db.unresolvedPromise.count({
          where: {
            workspaceId,
            status: 'pending',
            deadline: { lte: new Date(Date.now() + 3_600_000) }, // due within 1 hour
          },
        }),
      ])

      return {
        activeConversations,
        pendingActions,
        memoryOperations: memoryOps,
        activePromises,
        activeToolExecutions: 0, // FASE 3 will populate this
        unresolvedItems,
      }
    } catch (err) {
      logError(TAG, 'load_signals_error', err, { workspaceId })
      return CognitiveStateManager.defaultLoadFactors()
    }
  }

  private static async gatherFocusSignals(
    workspaceId: string,
  ): Promise<{
    focusTarget: string | null
    focusType: string
    focusIntensity: number
    attentionBudget: number
    attentionUsed: number
    shiftCount: number
  } | null> {
    try {
      const focus = await db.attentionalFocus.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
      })

      if (!focus) return null

      return {
        focusTarget: focus.focusTarget,
        focusType: focus.focusType,
        focusIntensity: focus.focusIntensity,
        attentionBudget: focus.attentionBudget,
        attentionUsed: focus.attentionUsed,
        shiftCount: focus.shiftCount,
      }
    } catch (err) {
      logError(TAG, 'focus_signals_error', err, { workspaceId })
      return null
    }
  }

  // ─────────────────────────────────────────────────────────
  // COMPUTATION METHODS
  // Pure functions that derive values from signal data.
  // ─────────────────────────────────────────────────────────

  /**
   * Computes a single cognitive load score from multiple load factors.
   * Each factor has a weight proportional to its cognitive cost.
   */
  static computeLoadScore(factors: LoadFactors): number {
    // Weights represent cognitive cost of each operation type
    const weights = {
      activeConversations: 0.15,    // Each active conversation consumes significant attention
      pendingActions: 0.10,         // Pending actions create background cognitive pressure
      memoryOperations: 0.05,       // Memory ops are relatively cheap but add up
      activePromises: 0.12,         // Active promises create persistent cognitive load
      activeToolExecutions: 0.20,   // Tool executions are the most expensive (FASE 3)
      unresolvedItems: 0.15,        // Unresolved items near deadline are very demanding
    }

    // Sigmoid-like scaling to prevent linear explosion
    const scale = (value: number, capacity: number): number => {
      if (value <= 0) return 0
      return Math.min(1.0, (value / capacity) ** 0.7)
    }

    const rawLoad =
      scale(factors.activeConversations, 8) * weights.activeConversations +
      scale(factors.pendingActions, 20) * weights.pendingActions +
      scale(factors.memoryOperations, 10) * weights.memoryOperations +
      scale(factors.activePromises, 10) * weights.activePromises +
      scale(factors.activeToolExecutions, 5) * weights.activeToolExecutions +
      scale(factors.unresolvedItems, 5) * weights.unresolvedItems

    return Math.min(1.0, Math.max(0.0, rawLoad))
  }

  /**
   * Determines temporal pressure from active promises.
   * Considers how many promises are near their deadline.
   */
  static computeTemporalPressure(
    promises: Array<{ deadline: Date | null; priorityScore: number }>,
  ): TemporalPressure {
    const now = Date.now()

    // Count promises in different urgency windows
    let urgentCount = 0
    let nearDeadlineCount = 0

    for (const promise of promises) {
      if (!promise.deadline) continue

      const msUntilDeadline = promise.deadline.getTime() - now

      if (msUntilDeadline <= 0) {
        // Already past deadline — highest pressure
        urgentCount++
      } else if (msUntilDeadline <= 30 * 60_000) {
        // Within 30 minutes
        urgentCount++
      } else if (msUntilDeadline <= 2 * 3_600_000) {
        // Within 2 hours
        nearDeadlineCount++
      }
    }

    if (urgentCount >= 3) return 'high'
    if (urgentCount >= 1 || nearDeadlineCount >= 3) return 'medium'
    if (nearDeadlineCount >= 1) return 'low'
    return 'none'
  }

  /**
   * Determines the current time horizon based on temporal pressure.
   * Under high pressure, the system narrows its focus to immediate concerns.
   */
  static computeTimeHorizon(
    pressure: TemporalPressure,
    promises: Array<{ deadline: Date | null }>,
  ): TimeHorizon {
    switch (pressure) {
      case 'high': return 'immediate'
      case 'medium': return 'short_term'
      case 'low': {
        // If any promises exist beyond 24 hours, we're in long-term planning mode
        const hasLongTerm = promises.some((p) =>
          p.deadline && p.deadline.getTime() > Date.now() + 24 * 3_600_000
        )
        return hasLongTerm ? 'long_term' : 'short_term'
      }
      case 'none': return 'long_term'
    }
  }

  /**
   * Computes salience for a given focus type.
   * Different types of focus have different base salience levels.
   */
  static computeSalience(focusType: string, intensity: number): number {
    const baseSalience: Record<string, number> = {
      conversation: 0.8,  // Conversations are naturally salient
      task: 0.6,
      promise: 0.9,       // Promises demand attention (accountability)
      emotion: 0.7,
      learning: 0.4,
      system: 0.3,
      none: 0.1,
    }

    const base = baseSalience[focusType] ?? 0.5
    return Math.min(1.0, base * intensity)
  }

  // ─────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────

  private static async persistState(data: {
    workspaceId: string
    kernelId: string
    conversationalFocus: { activeTopic: string | null; depth: number; salience: number }
    activeGoals: CognitiveGoal[]
    suppressedGoals: string[]
    cognitiveLoad: number
    loadFactors: LoadFactors
    temporalPressure: TemporalPressure
    timeHorizon: TimeHorizon
    emotionalMomentum: EmotionalVelocity
    unresolvedEmotionalEvents: number
    overallTrust: number
    trustTrend: TrustTrend
    coherenceScore: number
    identityDrift: number
    sessionId?: string
    contactId?: string
  }): Promise<void> {
    try {
      // Upsert: update if exists for this workspace, create otherwise
      const existing = await db.cognitiveState.findFirst({
        where: { workspaceId: data.workspaceId },
      })

      const stateData = {
        workspaceId: data.workspaceId,
        kernelId: data.kernelId,
        conversationalFocus: JSON.stringify(data.conversationalFocus),
        activeGoals: JSON.stringify(data.activeGoals),
        suppressedGoals: JSON.stringify(data.suppressedGoals),
        cognitiveLoad: data.cognitiveLoad,
        loadFactors: JSON.stringify(data.loadFactors),
        temporalPressure: data.temporalPressure,
        timeHorizon: data.timeHorizon,
        emotionalMomentum: data.emotionalMomentum,
        unresolvedEmotionalEvents: data.unresolvedEmotionalEvents,
        overallTrust: data.overallTrust,
        trustTrend: data.trustTrend,
        coherenceScore: data.coherenceScore,
        identityDrift: data.identityDrift,
        sessionId: data.sessionId ?? null,
        contactId: data.contactId ?? null,
      }

      if (existing) {
        await db.cognitiveState.update({
          where: { id: existing.id },
          data: stateData,
        })
      } else {
        await db.cognitiveState.create({ data: stateData })
      }
    } catch (err) {
      // Persistence failure should not break synthesis
      logError(TAG, 'persist_error', err, { workspaceId: data.workspaceId })
    }
  }

  private static recordToState(record: {
    workspaceId: string
    kernelId: string
    conversationalFocus: string
    activeGoals: string
    suppressedGoals: string
    cognitiveLoad: number
    loadFactors: string
    temporalPressure: string | null
    timeHorizon: string
    emotionalMomentum: string
    unresolvedEmotionalEvents: number
    overallTrust: number
    trustTrend: string
    coherenceScore: number
    identityDrift: number
    createdAt: Date
    updatedAt: Date
  }): SynthesizedCognitiveState {
    let conversationalFocus: SynthesizedCognitiveState['conversationalFocus']
    let activeGoals: CognitiveGoal[] = []
    let suppressedGoals: string[] = []
    let loadFactors: LoadFactors

    try {
      conversationalFocus = JSON.parse(record.conversationalFocus)
    } catch { conversationalFocus = { activeTopic: null, depth: 0.5, salience: 0.5 } }

    try { activeGoals = JSON.parse(record.activeGoals) } catch { /* empty */ }
    try { suppressedGoals = JSON.parse(record.suppressedGoals) } catch { /* empty */ }

    try {
      loadFactors = JSON.parse(record.loadFactors)
    } catch {
      loadFactors = CognitiveStateManager.defaultLoadFactors()
    }

    return {
      workspaceId: record.workspaceId,
      kernelId: record.kernelId,
      conversationalFocus,
      activeGoals,
      suppressedGoals,
      cognitiveLoad: record.cognitiveLoad,
      loadFactors,
      temporalPressure: (record.temporalPressure as TemporalPressure) ?? 'none',
      timeHorizon: record.timeHorizon as TimeHorizon,
      emotionalMomentum: record.emotionalMomentum as EmotionalVelocity,
      unresolvedEmotionalEvents: record.unresolvedEmotionalEvents,
      overallTrust: record.overallTrust,
      trustTrend: record.trustTrend as TrustTrend,
      coherenceScore: record.coherenceScore,
      identityDrift: record.identityDrift,
      synthesizedAt: record.updatedAt,
      sourceSnapshotCount: 0,
    }
  }

  private static defaultLoadFactors(): LoadFactors {
    return {
      activeConversations: 0,
      pendingActions: 0,
      memoryOperations: 0,
      activePromises: 0,
      activeToolExecutions: 0,
      unresolvedItems: 0,
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default CognitiveStateManager
