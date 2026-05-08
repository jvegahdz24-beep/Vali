// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Cognitive Runtime — The main orchestrator that ties everything together
//
// This is the SINGLE ENTRY POINT that the rest of the system uses
// to interact with the cognitive engine. Before ANY tool execution,
// message processing, or autonomous action, the runtime is consulted.
//
// Architecture:
//   1. Before action: runtime.gate() → approves/rejects/throttles
//   2. During action: runtime.getModifiers() → adjusts behavior
//   3. After action: runtime.record() → feeds signals back
//   4. Periodically: runtime.maintenance() → coherence checks, drift correction
//
// This file also contains:
//   - Tool gating interface (for FASE 3 to consume)
//   - Attention-aware planning helpers
//   - Emotional execution modifiers
// ═══════════════════════════════════════════════════════════════

import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { CognitiveStateManager } from './cognitive-state'
import { CoherenceMeter } from './coherence-meter'
import { CognitiveLoadManager, type LoadLevel } from './cognitive-load'
import { AttentionalBudgetManager } from './attentional-budget'
import { SalienceEngine } from './salience-engine'
import { PersonaKernel } from './persona-kernel'
import { DriftTracker } from './drift-tracker'
import { COGNITIVE_DEFAULTS, COGNITIVE_EVENTS } from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'COGNITIVE_RUNTIME'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type GateDecision = 'approved' | 'throttled' | 'rejected' | 'deferred'

export interface GateResult {
  decision: GateDecision
  reason: string
  cognitiveLoad: number
  coherenceScore: number
  emotionalState: string
  modifiers: ExecutionModifiers
  priorityBoost: number  // -1.0 to 1.0 adjustment to operation priority
}

export interface ExecutionModifiers {
  // How the cognitive state modifies execution behavior
  toneAdjustment: number       // -0.2 to 0.2 shift in tone (formality/warmth)
  responseUrgency: number      // 0.0 to 1.0 (how quickly to respond)
  detailLevel: number          // 0.0 (minimal) to 1.0 (comprehensive)
  empathyBoost: number         // 0.0 to 0.3 extra empathy when emotional
  cautionLevel: number         // 0.0 to 1.0 (how cautious to be)
  creativityLevel: number      // 0.0 to 1.0 (how creative/adaptive)
  shouldAcknowledgeEmotion: boolean
  shouldSimplify: boolean      // Simplify output when overloaded
  maxResponseLength: number    // Approximate max tokens
}

export interface CognitiveRuntimeConfig {
  enableAutoCorrection: boolean
  enableCoherenceMonitoring: boolean
  maintenanceIntervalMs: number
  coherenceCheckIntervalMs: number
}

// ═══════════════════════════════════════════════════════════════
// CognitiveRuntime — The main orchestrator
// ═══════════════════════════════════════════════════════════════

export class CognitiveRuntime {

  private static config: CognitiveRuntimeConfig = {
    enableAutoCorrection: true,
    enableCoherenceMonitoring: true,
    maintenanceIntervalMs: 5 * 60_000,        // 5 minutes
    coherenceCheckIntervalMs: 60 * 60_000,     // 1 hour
  }

  // ─────────────────────────────────────────────────────────
  // 1. GATE — The central decision point
  // Called before any autonomous action or tool execution.
  // Returns whether the action should proceed, and with what modifiers.
  //
  // This is the BRIDGE between FASE 4 (cognition) and FASE 3 (tools).
  // FASE 3 will call: `const gate = await runtime.gate(workspaceId, toolName)`
  // ─────────────────────────────────────────────────────────

  static async gate(
    workspaceId: string,
    operation: {
      type: 'tool_execution' | 'message_send' | 'autonomous_action' | 'background_task' | 'learning'
      name: string
      priority?: number       // 0.0–1.0
      contactId?: string
      estimatedComplexity?: number // 0.0–1.0
    },
  ): Promise<GateResult> {
    logInfo(TAG, 'gate_check', {
      workspaceId,
      opType: operation.type,
      opName: operation.name,
      priority: operation.priority,
    })

    try {
      // ── Step 1: Get current cognitive state ──
      const state = await CognitiveStateManager.synthesize(workspaceId)

      // ── Step 2: Check cognitive load ──
      const loadLevel = CognitiveLoadManager.classifyLoad(state.cognitiveLoad)
      const policy = CognitiveLoadManager.getPolicy(loadLevel)

      // ── Step 3: Check if this operation type is allowed ──
      const operationPolicyMap: Record<string, keyof typeof policy> = {
        tool_execution: 'backgroundTasks',
        message_send: 'promiseReminders',   // User-facing, always important
        autonomous_action: 'driftCorrection',
        background_task: 'backgroundTasks',
        learning: 'learningMode',
      }

      const policyKey = operationPolicyMap[operation.type] ?? 'backgroundTasks'
      const isAllowed = policy[policyKey] as boolean

      if (!isAllowed) {
        // Check if this is high priority — override for critical ops
        const priority = operation.priority ?? 0.5
        if (priority < 0.8) {
          return {
            decision: 'deferred',
            reason: `Operation type '${operation.type}' is disabled under ${loadLevel} cognitive load (${state.cognitiveLoad.toFixed(3)}). Policy: ${policy.description}`,
            cognitiveLoad: state.cognitiveLoad,
            coherenceScore: state.coherenceScore,
            emotionalState: state.emotionalMomentum,
            modifiers: CognitiveRuntime.defaultModifiers(),
            priorityBoost: -0.5,
          }
        }
        // High priority ops still proceed but throttled
      }

      // ── Step 4: Check coherence floor ──
      if (state.coherenceScore < COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold) {
        if (operation.type !== 'message_send') {
          // Only user-facing messages allowed when coherence is broken
          return {
            decision: 'rejected',
            reason: `Coherence critically low (${state.coherenceScore.toFixed(3)}). Only user-facing messages allowed. All autonomous operations suspended.`,
            cognitiveLoad: state.cognitiveLoad,
            coherenceScore: state.coherenceScore,
            emotionalState: state.emotionalMomentum,
            modifiers: CognitiveRuntime.defaultModifiers(),
            priorityBoost: -1.0,
          }
        }
      }

      // ── Step 5: Determine decision ──
      let decision: GateDecision = 'approved'
      let priorityBoost = 0

      if (state.cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.highThreshold) {
        if (operation.type === 'background_task' || operation.type === 'learning') {
          decision = 'rejected'
          priorityBoost = -0.3
        } else {
          decision = 'throttled'
          priorityBoost = -0.2
        }
      } else if (state.cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.moderateThreshold) {
        if (operation.type === 'background_task' || operation.type === 'learning') {
          decision = 'deferred'
          priorityBoost = -0.1
        } else {
          decision = 'throttled'
        }
      }

      // ── Step 6: Compute execution modifiers ──
      const modifiers = CognitiveRuntime.computeModifiers(state, operation)

      // ── Step 7: Attention-aware priority adjustment ──
      const attentionState = await AttentionalBudgetManager.getBudget(workspaceId)
      if (attentionState.budget.remaining < 0.3) {
        // Low attention budget — deprioritize non-critical ops
        if ((operation.priority ?? 0.5) < 0.7) {
          decision = 'deferred'
          priorityBoost -= 0.2
        }
      }

      // ── Step 8: Emotional modifier — boost empathy for emotional contacts ──
      if (state.emotionalMomentum === 'volatile' || state.emotionalMomentum === 'falling') {
        if (operation.type === 'message_send') {
          modifiers.empathyBoost += 0.15
          modifiers.shouldAcknowledgeEmotion = true
        }
      }

      logOk(TAG, 'gate_decision', {
        workspaceId,
        opType: operation.type,
        opName: operation.name,
        decision,
        cognitiveLoad: state.cognitiveLoad.toFixed(3),
        coherence: state.coherenceScore.toFixed(3),
        priorityBoost,
      })

      return {
        decision,
        reason: CognitiveRuntime.explainDecision(decision, state, loadLevel),
        cognitiveLoad: state.cognitiveLoad,
        coherenceScore: state.coherenceScore,
        emotionalState: state.emotionalMomentum,
        modifiers,
        priorityBoost,
      }
    } catch (err) {
      logError(TAG, 'gate_error', err, { workspaceId })
      // On error, allow the operation (fail-open for safety)
      return {
        decision: 'approved',
        reason: 'Gate check failed. Allowing operation (fail-open).',
        cognitiveLoad: 0,
        coherenceScore: 1.0,
        emotionalState: 'stable',
        modifiers: CognitiveRuntime.defaultModifiers(),
        priorityBoost: 0,
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET MODIFIERS — Get execution modifiers without gating
  // Useful for adjusting behavior without blocking operations.
  // ─────────────────────────────────────────────────────────

  static async getModifiers(
    workspaceId: string,
    operation?: {
      type: string
      contactId?: string
    },
  ): Promise<ExecutionModifiers> {
    try {
      const state = await CognitiveStateManager.synthesize(workspaceId)
      return CognitiveRuntime.computeModifiers(state, operation ?? { type: 'general' })
    } catch {
      return CognitiveRuntime.defaultModifiers()
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. RECORD — Feed signals back into the cognitive engine
  // Called after operations complete to update cognitive state.
  // ─────────────────────────────────────────────────────────

  static async record(
    workspaceId: string,
    event: {
      type: 'interaction' | 'tool_completed' | 'emotion_detected' | 'promise_made' | 'promise_fulfilled' | 'trust_event' | 'error' | 'milestone'
      data: Record<string, unknown>
    },
  ): Promise<void> {
    try {
      switch (event.type) {
        case 'interaction': {
          // Each interaction causes micro-drift
          const driftAmount = COGNITIVE_DEFAULTS.DRIFT.perInteractionDrift
          // This is handled by applyDrift in PersonaKernel when specific adjustments are needed
          // Here we just record the interaction happened
          logInfo(TAG, 'interaction_recorded', { workspaceId })
          break
        }

        case 'tool_completed': {
          // Tool completion may affect cognitive load
          await CognitiveLoadManager.measure(workspaceId)
          break
        }

        case 'emotion_detected': {
          // Emotional events are processed by EmotionalMomentum subsystem
          // This is a hook for FASE 3 integration
          logInfo(TAG, 'emotion_recorded', { workspaceId, data: event.data })
          break
        }

        case 'promise_made': {
          // Promise created — will be picked up by salience engine
          await SalienceEngine.updatePromiseSalience(workspaceId)
          break
        }

        case 'promise_fulfilled': {
          // Promise fulfilled — recalculate priorities
          await SalienceEngine.updatePromiseSalience(workspaceId)
          break
        }

        case 'trust_event': {
          // Trust event recorded — will affect future state synthesis
          logInfo(TAG, 'trust_event_recorded', { workspaceId })
          break
        }

        case 'error': {
          // Errors may temporarily increase cognitive load
          logWarn(TAG, 'error_recorded', { workspaceId })
          break
        }

        case 'milestone': {
          // Positive events — may improve trust
          logInfo(TAG, 'milestone_recorded', { workspaceId })
          break
        }
      }
    } catch (err) {
      logError(TAG, 'record_error', err, { workspaceId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. MAINTENANCE — Periodic maintenance tasks
  // Should be called by a background job (cron/BullMQ).
  // ─────────────────────────────────────────────────────────

  static async maintenance(
    workspaceId: string,
    options?: {
      forceCoherenceCheck?: boolean
      forceDriftCheck?: boolean
      forceLoadCleanup?: boolean
    },
  ): Promise<{
    coherenceChecked: boolean
    coherenceGrade: string | null
    driftCorrected: boolean
    driftBefore: number
    driftAfter: number
    salienceUpdated: boolean
    loadCleaned: boolean
  }> {
    logInfo(TAG, 'maintenance_start', { workspaceId })

    let coherenceChecked = false
    let coherenceGrade: string | null = null
    let driftCorrected = false
    let driftBefore = 0
    let driftAfter = 0
    let salienceUpdated = false
    let loadCleaned = false

    try {
      // ── 1. Check if cognitive load allows maintenance ──
      const canRunBackground = await CognitiveLoadManager.shouldRun(workspaceId, 'backgroundTasks')
      if (!canRunBackground && !options?.forceCoherenceCheck) {
        return {
          coherenceChecked, coherenceGrade, driftCorrected,
          driftBefore, driftAfter, salienceUpdated, loadCleaned,
        }
      }

      // ── 2. Coherence check ──
      const health = await CoherenceMeter.healthCheck(workspaceId, { forceNewSnapshot: options?.forceCoherenceCheck })
      coherenceChecked = true
      coherenceGrade = health.healthGrade

      // ── 3. Auto-correct if needed and enabled ──
      if (CognitiveRuntime.config.enableAutoCorrection && health.correctionPolicy.autoExecutable) {
        if (health.correctionPolicy.action !== 'none' && health.correctionPolicy.action !== 'monitor') {
          const correction = await CoherenceMeter.autoCorrect(workspaceId)
          driftCorrected = correction.corrected
          driftBefore = correction.driftBefore
          driftAfter = correction.driftAfter
        }
      }

      // ── 4. Drift assessment + correction ──
      if (options?.forceDriftCheck) {
        const driftReport = await DriftTracker.assess(workspaceId)
        if (driftReport.needsCorrection) {
          await DriftTracker.autoCorrect(workspaceId, 'maintenance_drift_check')
          driftCorrected = true
        }
      }

      // ── 5. Update promise salience ──
      await SalienceEngine.updatePromiseSalience(workspaceId)
      salienceUpdated = true

      // ── 6. Load cleanup ──
      if (options?.forceLoadCleanup) {
        await CognitiveLoadManager.cleanup(workspaceId)
        loadCleaned = true
      }

      logOk(TAG, 'maintenance_complete', {
        workspaceId,
        coherenceGrade,
        driftCorrected,
        salienceUpdated,
      })

      return {
        coherenceChecked, coherenceGrade, driftCorrected,
        driftBefore, driftAfter, salienceUpdated, loadCleaned,
      }
    } catch (err) {
      logError(TAG, 'maintenance_error', err, { workspaceId })
      return {
        coherenceChecked, coherenceGrade, driftCorrected,
        driftBefore, driftAfter, salienceUpdated, loadCleaned,
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. ATTENTION-AWARE PLANNING
  // Returns a prioritized list of pending items, filtered and
  // ranked by attentional capacity and salience.
  // ─────────────────────────────────────────────────────────

  static async attentionAwarePlan(
    workspaceId: string,
  ): Promise<{
    canAcceptNewTasks: boolean
    currentFocus: string | null
    prioritizedPromises: Array<{
      id: string
      text: string
      salience: number
      deadline: Date | null
    }>
    suppressedItems: string[]
    availableCapacity: number
    recommendation: string
  }> {
    try {
      const state = await CognitiveStateManager.synthesize(workspaceId)
      const budget = await AttentionalBudgetManager.getBudget(workspaceId)
      const rankedPromises = await SalienceEngine.rankPromises(workspaceId)

      // Filter by salience threshold
      const threshold = SalienceEngine.getSalienceThreshold(state.cognitiveLoad)
      const visiblePromises = rankedPromises.filter((p) => p.salience >= threshold)

      // Can accept new tasks?
      const canAccept = budget.budget.remaining > 0.3 && state.cognitiveLoad < COGNITIVE_DEFAULTS.LOAD.highThreshold

      // Recommendation
      let recommendation: string
      if (state.cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.overloadThreshold) {
        recommendation = 'System is overloaded. Focus only on the most critical pending item. All other tasks should be deferred.'
      } else if (state.cognitiveLoad >= COGNITIVE_DEFAULTS.LOAD.highThreshold) {
        recommendation = 'High cognitive load. Handle only high-priority items. Consider pausing non-essential operations.'
      } else if (budget.budget.remaining < 0.3) {
        recommendation = 'Attentional budget nearly exhausted. Complete current focus before accepting new tasks.'
      } else if (visiblePromises.length > 3) {
        recommendation = `Multiple items competing for attention (${visiblePromises.length}). Prioritize top 3 and defer the rest.`
      } else {
        recommendation = 'Cognitive capacity available. Normal operations can proceed.'
      }

      return {
        canAcceptNewTasks: canAccept,
        currentFocus: budget.focusTargets[0]?.targetId ?? null,
        prioritizedPromises: visiblePromises.slice(0, 5).map((p) => ({
          id: p.promiseId,
          text: p.promiseText,
          salience: p.salience,
          deadline: p.deadline,
        })),
        suppressedItems: state.suppressedGoals,
        availableCapacity: budget.budget.remaining,
        recommendation,
      }
    } catch (err) {
      logError(TAG, 'attention_plan_error', err, { workspaceId })
      return {
        canAcceptNewTasks: true,
        currentFocus: null,
        prioritizedPromises: [],
        suppressedItems: [],
        availableCapacity: 1.0,
        recommendation: 'Unable to compute attention-aware plan. Allowing all operations.',
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 6. CONFIGURE — Update runtime configuration
  // ─────────────────────────────────────────────────────────

  static configure(config: Partial<CognitiveRuntimeConfig>): void {
    CognitiveRuntime.config = { ...CognitiveRuntime.config, ...config }
    logInfo(TAG, 'config_updated', { config: CognitiveRuntime.config })
  }

  static getConfig(): CognitiveRuntimeConfig {
    return { ...CognitiveRuntime.config }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Compute execution modifiers
  // Translates cognitive state into concrete behavior adjustments.
  // ─────────────────────────────────────────────────────────

  private static computeModifiers(
    state: {
      cognitiveLoad: number
      coherenceScore: number
      emotionalMomentum: string
      mood?: string
      trustTrend: string
      timeHorizon: string
      temporalPressure: string
    },
    operation: { type: string; contactId?: string },
  ): ExecutionModifiers {
    const modifiers: ExecutionModifiers = {
      toneAdjustment: 0,
      responseUrgency: 0.5,
      detailLevel: 0.7,
      empathyBoost: 0,
      cautionLevel: 0.3,
      creativityLevel: 0.5,
      shouldAcknowledgeEmotion: false,
      shouldSimplify: false,
      maxResponseLength: 500,
    }

    // ── Cognitive load adjustments ──
    if (state.cognitiveLoad > COGNITIVE_DEFAULTS.LOAD.highThreshold) {
      modifiers.shouldSimplify = true
      modifiers.maxResponseLength = 200
      modifiers.detailLevel = 0.3
      modifiers.creativityLevel = 0.2
    } else if (state.cognitiveLoad > COGNITIVE_DEFAULTS.LOAD.moderateThreshold) {
      modifiers.maxResponseLength = 350
      modifiers.detailLevel = 0.5
      modifiers.creativityLevel = 0.4
    }

    // ── Emotional adjustments ──
    switch (state.emotionalMomentum) {
      case 'volatile':
        modifiers.empathyBoost = 0.2
        modifiers.cautionLevel = 0.7
        modifiers.shouldAcknowledgeEmotion = true
        modifiers.creativityLevel = 0.3
        break
      case 'falling':
        modifiers.empathyBoost = 0.15
        modifiers.cautionLevel = 0.5
        modifiers.shouldAcknowledgeEmotion = true
        break
      case 'rising':
        modifiers.creativityLevel = 0.7
        modifiers.responseUrgency = 0.6
        break
      case 'recovering':
        modifiers.empathyBoost = 0.1
        modifiers.cautionLevel = 0.4
        break
      case 'stable':
        // Default — no adjustments
        break
    }

    // ── Trust adjustments ──
    if (state.trustTrend === 'degrading') {
      modifiers.cautionLevel += 0.2
      modifiers.detailLevel += 0.1
      modifiers.toneAdjustment -= 0.05 // More formal when trust is low
    } else if (state.trustTrend === 'improving') {
      modifiers.creativityLevel += 0.1
      modifiers.toneAdjustment += 0.05 // Warmer when trust is high
    }

    // ── Temporal pressure adjustments ──
    if (state.temporalPressure === 'high') {
      modifiers.responseUrgency = 0.9
      modifiers.detailLevel = Math.max(0.3, modifiers.detailLevel - 0.2)
      modifiers.maxResponseLength = Math.min(modifiers.maxResponseLength, 300)
    } else if (state.temporalPressure === 'medium') {
      modifiers.responseUrgency = 0.7
    }

    // ── Coherence adjustments ──
    if (state.coherenceScore < COGNITIVE_DEFAULTS.COHERENCE.minCoherenceThreshold) {
      modifiers.cautionLevel += 0.3
      modifiers.creativityLevel = Math.max(0.2, modifiers.creativityLevel - 0.2)
      modifiers.shouldSimplify = true
    }

    // ── Clamp all values to valid ranges ──
    modifiers.toneAdjustment = Math.max(-0.2, Math.min(0.2, modifiers.toneAdjustment))
    modifiers.responseUrgency = Math.max(0, Math.min(1, modifiers.responseUrgency))
    modifiers.detailLevel = Math.max(0, Math.min(1, modifiers.detailLevel))
    modifiers.empathyBoost = Math.max(0, Math.min(0.3, modifiers.empathyBoost))
    modifiers.cautionLevel = Math.max(0, Math.min(1, modifiers.cautionLevel))
    modifiers.creativityLevel = Math.max(0, Math.min(1, modifiers.creativityLevel))

    return modifiers
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Default modifiers when everything fails
  // ─────────────────────────────────────────────────────────

  private static defaultModifiers(): ExecutionModifiers {
    return {
      toneAdjustment: 0,
      responseUrgency: 0.5,
      detailLevel: 0.7,
      empathyBoost: 0,
      cautionLevel: 0.3,
      creativityLevel: 0.5,
      shouldAcknowledgeEmotion: false,
      shouldSimplify: false,
      maxResponseLength: 500,
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Explain gate decision
  // ─────────────────────────────────────────────────────────

  private static explainDecision(
    decision: GateDecision,
    state: { cognitiveLoad: number; coherenceScore: number; emotionalMomentum: string },
    loadLevel: LoadLevel,
  ): string {
    switch (decision) {
      case 'approved':
        return `Approved. Cognitive load: ${state.cognitiveLoad.toFixed(3)} (${loadLevel}). Coherence: ${state.coherenceScore.toFixed(3)}. Full execution capacity.`
      case 'throttled':
        return `Throttled. Cognitive load: ${state.cognitiveLoad.toFixed(3)} (${loadLevel}). Operation will execute with reduced resources and simplified output.`
      case 'rejected':
        return `Rejected. Cognitive load: ${state.cognitiveLoad.toFixed(3)} (${loadLevel}). Coherence: ${state.coherenceScore.toFixed(3)}. System cannot safely execute this operation.`
      case 'deferred':
        return `Deferred. Cognitive load: ${state.cognitiveLoad.toFixed(3)} (${loadLevel}). Operation queued for later execution when capacity is available.`
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default CognitiveRuntime
