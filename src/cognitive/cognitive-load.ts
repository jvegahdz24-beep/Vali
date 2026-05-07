// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Cognitive Load Manager — Monitors, measures, and manages
// the system's cognitive capacity.
//
// When cognitive load is too high, the system degrades gracefully:
//   - Background tasks are paused
//   - Low-priority goals are suppressed
//   - Attentional budget shrinks
//   - Only critical operations continue
//
// This prevents the system from "trying to do everything at once"
// and burning out its own cognitive coherence.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { CognitiveStateManager } from './cognitive-state'
import { AttentionalBudgetManager } from './attentional-budget'
import {
  type LoadFactors,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'COGNITIVE_LOAD'
const LOAD_HISTORY_WINDOW_HOURS = 24
const MAX_LOAD_ENTRIES_PER_WORKSPACE = 100

// ─── Load Level Thresholds ─────────────────────────────────────

export type LoadLevel = 'idle' | 'optimal' | 'moderate' | 'high' | 'overloaded'

const LOAD_LEVEL_THRESHOLDS: Array<{ level: LoadLevel; min: number; max: number }> = [
  { level: 'idle', min: 0.0, max: 0.15 },
  { level: 'optimal', min: 0.15, max: COGNITIVE_DEFAULTS.LOAD.moderateThreshold },
  { level: 'moderate', min: COGNITIVE_DEFAULTS.LOAD.moderateThreshold, max: COGNITIVE_DEFAULTS.LOAD.highThreshold },
  { level: 'high', min: COGNITIVE_DEFAULTS.LOAD.highThreshold, max: COGNITIVE_DEFAULTS.LOAD.overloadThreshold },
  { level: 'overloaded', min: COGNITIVE_DEFAULTS.LOAD.overloadThreshold, max: 1.0 },
]

// ─── Graceful Degradation Policies ──────────────────────────────
// What to do at each load level.

const DEGRADATION_POLICIES: Record<LoadLevel, {
  backgroundTasks: boolean     // Run background cognition jobs?
  promiseReminders: boolean    // Send promise reminders?
  coherenceScans: boolean      // Run periodic coherence checks?
  driftCorrection: boolean     // Auto-correct drift?
  learningMode: boolean        // Process new learning?
  emotionalProcessing: boolean // Process emotional events?
  maxActiveOperations: number  // Max concurrent operations
  description: string
}> = {
  idle: {
    backgroundTasks: true,
    promiseReminders: true,
    coherenceScans: true,
    driftCorrection: true,
    learningMode: true,
    emotionalProcessing: true,
    maxActiveOperations: 20,
    description: 'System is idle. Full capacity available. All operations enabled.',
  },
  optimal: {
    backgroundTasks: true,
    promiseReminders: true,
    coherenceScans: true,
    driftCorrection: true,
    learningMode: true,
    emotionalProcessing: true,
    maxActiveOperations: 15,
    description: 'Cognitive load is optimal. All operations running normally.',
  },
  moderate: {
    backgroundTasks: true,
    promiseReminders: true,
    coherenceScans: true,
    driftCorrection: false,    // Skip auto-correction, just monitor
    learningMode: false,        // Defer learning
    emotionalProcessing: true,
    maxActiveOperations: 10,
    description: 'Moderate cognitive load. Non-essential tasks deferred. User-facing operations prioritized.',
  },
  high: {
    backgroundTasks: false,     // Pause all background tasks
    promiseReminders: true,     // Keep critical reminders
    coherenceScans: false,
    driftCorrection: false,
    learningMode: false,
    emotionalProcessing: true,  // Still process emotions (important for coherence)
    maxActiveOperations: 5,
    description: 'High cognitive load. Only critical operations active. Background tasks paused.',
  },
  overloaded: {
    backgroundTasks: false,
    promiseReminders: false,    // Even reminders paused
    coherenceScans: false,
    driftCorrection: false,
    learningMode: false,
    emotionalProcessing: false, // Minimal processing
    maxActiveOperations: 2,
    description: 'COGNITIVE OVERLOAD. Emergency mode. Only the most critical operations allowed. System is shedding load.',
  },
}

// ═══════════════════════════════════════════════════════════════
// CognitiveLoadManager
// ═══════════════════════════════════════════════════════════════

export class CognitiveLoadManager {

  // ─────────────────────────────────────────────────────────
  // 1. MEASURE — Takes a snapshot of current cognitive load
  // ─────────────────────────────────────────────────────────

  static async measure(
    workspaceId: string,
    options?: {
      sessionId?: string
      contactId?: string
    },
  ): Promise<{
    loadScore: number
    loadLevel: LoadLevel
    factors: LoadFactors
    capacityUsed: number
    capacityLimit: number
    policy: typeof DEGRADATION_POLICIES[LoadLevel]
  }> {
    logInfo(TAG, 'measure_start', { workspaceId })

    try {
      // Gather load factors
      const factors = await CognitiveStateManager.gatherLoadSignals(workspaceId)

      // Compute load score using the state manager's algorithm
      const loadScore = CognitiveStateManager.computeLoadScore(factors)

      // Determine load level
      const loadLevel = CognitiveLoadManager.classifyLoad(loadScore)

      // Compute capacity
      const capacityLimit = DEGRADATION_POLICIES[loadLevel].maxActiveOperations
      const activeOps = Object.values(factors).reduce((sum, v) => sum + v, 0)
      const capacityUsed = Math.min(1.0, activeOps / capacityLimit)

      // Persist load entry for historical tracking
      await CognitiveLoadManager.persistLoadEntry({
        workspaceId,
        loadScore,
        loadLevel,
        factors,
        capacityUsed,
        capacityLimit,
        sessionId: options?.sessionId,
        contactId: options?.contactId,
      })

      // Get the applicable degradation policy
      const policy = DEGRADATION_POLICIES[loadLevel]

      logOk(TAG, 'measure_complete', {
        workspaceId,
        loadScore: loadScore.toFixed(3),
        loadLevel,
        activeOps,
        capacityUsed: capacityUsed.toFixed(3),
      })

      return {
        loadScore,
        loadLevel,
        factors,
        capacityUsed,
        capacityLimit,
        policy,
      }
    } catch (err) {
      logError(TAG, 'measure_error', err, { workspaceId })
      return CognitiveLoadManager.defaultMeasurement()
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. APPLY DEGRADATION — When load is high, apply graceful
  // degradation policies. Adjusts attentional budget, suppresses
  // low-priority items, and pauses background tasks.
  // ─────────────────────────────────────────────────────────

  static async applyDegradation(
    workspaceId: string,
    loadScore: number,
    loadLevel: LoadLevel,
  ): Promise<{
    degraded: boolean
    actions: string[]
    budgetBefore: number
    budgetAfter: number
  }> {
    const actions: string[] = []

    try {
      // ── Adjust attentional budget based on load ──
      const budgetResult = await AttentionalBudgetManager.reduceBudget(workspaceId, loadScore)
      const budgetBefore = budgetResult.oldBudget
      const budgetAfter = budgetResult.newBudget

      if (budgetAfter < budgetBefore) {
        actions.push(`Attention budget reduced: ${budgetBefore.toFixed(2)} → ${budgetAfter.toFixed(2)}`)
      }

      if (budgetResult.suppressedByLoad.length > 0) {
        actions.push(`Suppressed focus types: ${budgetResult.suppressedByLoad.join(', ')}`)
      }

      // ── Apply policy-specific actions ──
      const policy = DEGRADATION_POLICIES[loadLevel]

      if (!policy.backgroundTasks) {
        actions.push('Background cognition tasks paused')
      }

      if (!policy.driftCorrection) {
        actions.push('Auto-drift correction suspended')
      }

      if (!policy.learningMode) {
        actions.push('Learning mode disabled')
      }

      if (!policy.emotionalProcessing) {
        actions.push('Emotional processing minimal')
      }

      if (!policy.coherenceScans) {
        actions.push('Periodic coherence scans paused')
      }

      const degraded = actions.length > 0

      if (degraded) {
        logWarn(TAG, 'degradation_applied', {
          workspaceId,
          loadScore: loadScore.toFixed(3),
          loadLevel,
          actions,
        })
      }

      return {
        degraded,
        actions,
        budgetBefore,
        budgetAfter,
      }
    } catch (err) {
      logError(TAG, 'degradation_error', err, { workspaceId })
      return {
        degraded: false,
        actions: [],
        budgetBefore: 1.0,
        budgetAfter: 1.0,
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. RECOVER — When load decreases, restore normal operations
  // ─────────────────────────────────────────────────────────

  static async recover(
    workspaceId: string,
    loadScore: number,
  ): Promise<{
    recovered: boolean
    actions: string[]
  }> {
    const actions: string[] = []

    try {
      // Restore attentional budget
      const budgetResult = await AttentionalBudgetManager.restoreBudget(workspaceId, loadScore)
      if (budgetResult.restored.length > 0) {
        actions.push(`Restored focus types: ${budgetResult.restored.join(', ')}`)
      }

      const recovered = actions.length > 0

      if (recovered) {
        logOk(TAG, 'recovery_applied', {
          workspaceId,
          loadScore: loadScore.toFixed(3),
          actions,
        })
      }

      return { recovered, actions }
    } catch (err) {
      logError(TAG, 'recovery_error', err, { workspaceId })
      return { recovered: false, actions: [] }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. SHOULD RUN — Check if a specific operation type should
  // run given the current load level.
  // ─────────────────────────────────────────────────────────

  static async shouldRun(
    workspaceId: string,
    operationType: keyof typeof DEGRADATION_POLICIES[LoadLevel],
  ): Promise<boolean> {
    const measurement = await CognitiveLoadManager.measure(workspaceId)
    return measurement.policy[operationType] as boolean
  }

  // ─────────────────────────────────────────────────────────
  // 5. GET LOAD HISTORY — Time-series load data for analysis
  // ─────────────────────────────────────────────────────────

  static async getLoadHistory(
    workspaceId: string,
    hours: number = LOAD_HISTORY_WINDOW_HOURS,
    limit: number = 100,
  ): Promise<Array<{
    loadScore: number
    loadLevel: string
    activeConversations: number
    pendingActions: number
    activePromises: number
    createdAt: Date
  }>> {
    const since = new Date(Date.now() - hours * 3_600_000)

    const entries = await db.cognitiveLoadEntry.findMany({
      where: {
        workspaceId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        loadScore: true,
        loadLevel: true,
        activeConversations: true,
        pendingActions: true,
        activePromises: true,
        createdAt: true,
      },
    })

    return entries.map((e) => ({
      loadScore: e.loadScore,
      loadLevel: e.loadLevel,
      activeConversations: e.activeConversations,
      pendingActions: e.pendingActions,
      activePromises: e.activePromises,
      createdAt: e.createdAt,
    }))
  }

  // ─────────────────────────────────────────────────────────
  // 6. GET LOAD TREND — Trend analysis over time
  // ─────────────────────────────────────────────────────────

  static async getLoadTrend(
    workspaceId: string,
    hours: number = 24,
  ): Promise<{
    trend: 'increasing' | 'stable' | 'decreasing'
    averageLoad: number
    peakLoad: number
    timeSpent: Record<LoadLevel, number> // hours in each level
    overloadCount: number
  }> {
    const history = await CognitiveLoadManager.getLoadHistory(workspaceId, hours, 500)

    if (history.length < 2) {
      return {
        trend: 'stable',
        averageLoad: 0,
        peakLoad: 0,
        timeSpent: { idle: 0, optimal: 0, moderate: 0, high: 0, overloaded: 0 },
        overloadCount: 0,
      }
    }

    // Compute average
    const totalLoad = history.reduce((sum, h) => sum + h.loadScore, 0)
    const averageLoad = totalLoad / history.length

    // Peak
    const peakLoad = Math.max(...history.map((h) => h.loadScore))

    // Trend from first half vs second half
    const mid = Math.floor(history.length / 2)
    const firstHalfAvg = history.slice(0, mid).reduce((sum, h) => sum + h.loadScore, 0) / mid
    const secondHalfAvg = history.slice(mid).reduce((sum, h) => sum + h.loadScore, 0) / (history.length - mid)

    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable'
    const diff = secondHalfAvg - firstHalfAvg
    if (diff > 0.05) trend = 'increasing'
    else if (diff < -0.05) trend = 'decreasing'

    // Time spent per level (approximate from entry count)
    const levelCounts: Record<LoadLevel, number> = { idle: 0, optimal: 0, moderate: 0, high: 0, overloaded: 0 }
    for (const h of history) {
      const level = h.loadLevel as LoadLevel
      if (level in levelCounts) levelCounts[level]++
    }

    const totalEntries = history.length
    const timeSpent: Record<LoadLevel, number> = {
      idle: Math.round((levelCounts.idle / totalEntries) * hours * 10) / 10,
      optimal: Math.round((levelCounts.optimal / totalEntries) * hours * 10) / 10,
      moderate: Math.round((levelCounts.moderate / totalEntries) * hours * 10) / 10,
      high: Math.round((levelCounts.high / totalEntries) * hours * 10) / 10,
      overloaded: Math.round((levelCounts.overloaded / totalEntries) * hours * 10) / 10,
    }

    return {
      trend,
      averageLoad: Math.round(averageLoad * 1000) / 1000,
      peakLoad: Math.round(peakLoad * 1000) / 1000,
      timeSpent,
      overloadCount: levelCounts.overloaded,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. CLEANUP — Remove old load entries to prevent unbounded
  // growth of the CognitiveLoadEntry table.
  // ─────────────────────────────────────────────────────────

  static async cleanup(
    workspaceId?: string,
    maxAgeHours: number = 168, // 1 week default
  ): Promise<{ deleted: number }> {
    try {
      const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000)

      // Also enforce max entries per workspace
      if (workspaceId) {
        // Delete entries older than cutoff
        const result1 = await db.cognitiveLoadEntry.deleteMany({
          where: {
            workspaceId,
            createdAt: { lt: cutoff },
          },
        })

        // If still too many entries, delete oldest
        const count = await db.cognitiveLoadEntry.count({
          where: { workspaceId },
        })

        let deleted = result1.count
        if (count > MAX_LOAD_ENTRIES_PER_WORKSPACE) {
          const excess = count - MAX_LOAD_ENTRIES_PER_WORKSPACE
          const oldest = await db.cognitiveLoadEntry.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'asc' },
            take: excess,
            select: { id: true },
          })
          const idsToDelete = oldest.map((e) => e.id)

          if (idsToDelete.length > 0) {
            const result2 = await db.cognitiveLoadEntry.deleteMany({
              where: { id: { in: idsToDelete } },
            })
            deleted += result2.count
          }
        }

        return { deleted }
      }

      // Global cleanup (no workspace filter)
      const result = await db.cognitiveLoadEntry.deleteMany({
        where: { createdAt: { lt: cutoff } },
      })

      return { deleted: result.count }
    } catch (err) {
      logError(TAG, 'cleanup_error', err)
      return { deleted: 0 }
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Classifies a load score into a discrete level.
   */
  static classifyLoad(loadScore: number): LoadLevel {
    for (const threshold of LOAD_LEVEL_THRESHOLDS) {
      if (loadScore >= threshold.min && loadScore < threshold.max) {
        return threshold.level
      }
    }
    return 'overloaded' // Scores of exactly 1.0
  }

  /**
   * Gets the degradation policy for a given load level.
   */
  static getPolicy(loadLevel: LoadLevel): typeof DEGRADATION_POLICIES[LoadLevel] {
    return DEGRADATION_POLICIES[loadLevel]
  }

  /**
   * Persists a load entry to the database.
   */
  private static async persistLoadEntry(data: {
    workspaceId: string
    loadScore: number
    loadLevel: LoadLevel
    factors: LoadFactors
    capacityUsed: number
    capacityLimit: number
    sessionId?: string
    contactId?: string
  }): Promise<void> {
    try {
      await db.cognitiveLoadEntry.create({
        data: {
          workspaceId: data.workspaceId,
          loadScore: data.loadScore,
          loadLevel: data.loadLevel,
          activeConversations: data.factors.activeConversations,
          pendingActions: data.factors.pendingActions,
          memoryOperations: data.factors.memoryOperations,
          activePromises: data.factors.activePromises,
          activeToolExecutions: data.factors.activeToolExecutions,
          unresolvedItems: data.factors.unresolvedItems,
          capacityUsed: data.capacityUsed,
          capacityLimit: data.capacityLimit,
          sessionId: data.sessionId ?? null,
          contactId: data.contactId ?? null,
        },
      })
    } catch (err) {
      // Persistence failure should not break load measurement
      logError(TAG, 'persist_error', err, { workspaceId: data.workspaceId })
    }
  }

  /**
   * Returns a safe default measurement when everything fails.
   */
  private static defaultMeasurement(): {
    loadScore: number
    loadLevel: LoadLevel
    factors: LoadFactors
    capacityUsed: number
    capacityLimit: number
    policy: typeof DEGRADATION_POLICIES[LoadLevel]
  } {
    return {
      loadScore: 0,
      loadLevel: 'idle',
      factors: {
        activeConversations: 0,
        pendingActions: 0,
        memoryOperations: 0,
        activePromises: 0,
        activeToolExecutions: 0,
        unresolvedItems: 0,
      },
      capacityUsed: 0,
      capacityLimit: 20,
      policy: DEGRADATION_POLICIES.idle,
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default CognitiveLoadManager
