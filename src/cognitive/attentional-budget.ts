// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Attentional Budget — Artificial cognitive limits
// Like humans, the system can only focus on a limited number of
// things at once. This implements:
//   - Budget allocation (total, used, remaining)
//   - Focus tracking (what the system is attending to)
//   - Suppression (what's being deliberately ignored)
//   - Shift cooldown (prevent rapid context switching)
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import {
  type FocusTarget,
  type FocusType,
  type AttentionalBudget,
  type SuppressionSignal,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'
import { SalienceEngine } from './salience-engine'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'ATTENTIONAL_BUDGET'
const CACHE_NAMESPACE = 'cognitive:attention'

// ─── Attention Cost per Focus Type ─────────────────────────────
// How much of the attentional budget each focus type consumes.

const ATTENTION_COSTS: Record<string, number> = {
  conversation: 0.30,  // Active conversation requires significant attention
  task: 0.25,          // Task execution is moderately demanding
  promise: 0.20,       // Promise fulfillment (background nagging)
  emotion: 0.15,       // Emotional processing
  learning: 0.10,      // Learning is lightweight background processing
  system: 0.05,        // System tasks are minimal attention
  none: 0.0,
}

// ─── Max simultaneous focus items per load level ────────────────

const MAX_FOCUS_ITEMS = {
  optimal: 5,
  moderate: 3,
  high: 2,
  overloaded: 1,
} as const

// ═══════════════════════════════════════════════════════════════
// AttentionalBudgetManager
// ═══════════════════════════════════════════════════════════════

export class AttentionalBudgetManager {

  // ─────────────────────────────────────────────────────────
  // 1. GET BUDGET — Returns current attentional budget state
  // ─────────────────────────────────────────────────────────

  static async getBudget(workspaceId: string): Promise<{
    budget: AttentionalBudget
    focusTargets: FocusTarget[]
    suppressedSignals: SuppressionSignal[]
    shiftCount: number
    maxFocusItems: number
  }> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
      })

      if (!record) {
        return AttentionalBudgetManager.emptyBudget()
      }

      const budget: AttentionalBudget = {
        total: record.attentionBudget,
        used: record.attentionUsed,
        remaining: Math.max(0, record.attentionBudget - record.attentionUsed),
      }

      const focusTargets: FocusTarget[] = record.focusTarget
        ? [{
            targetId: record.id,
            targetType: record.focusType as FocusType,
            salience: SalienceEngine.getFocusTypeSalience(record.focusType as FocusType),
            intensity: record.focusIntensity,
            acquiredAt: record.createdAt,
            estimatedDuration: 0,
          }]
        : []

      let suppressedSignals: SuppressionSignal[] = []
      try {
        suppressedSignals = JSON.parse(record.suppressedSignals)
      } catch { /* empty */ }

      // Determine max focus items based on load
      const loadLevel = AttentionalBudgetManager.inferLoadLevel(budget)
      const maxFocusItems = MAX_FOCUS_ITEMS[loadLevel]

      return {
        budget,
        focusTargets,
        suppressedSignals,
        shiftCount: record.shiftCount,
        maxFocusItems,
      }
    } catch (err) {
      logError(TAG, 'get_budget_error', err, { workspaceId })
      return AttentionalBudgetManager.emptyBudget()
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. ACQUIRE FOCUS — Attempt to focus on a target
  // Checks if budget has capacity, enforces cooldown, and
  // may suppress lower-salience items if necessary.
  // ─────────────────────────────────────────────────────────

  static async acquireFocus(
    workspaceId: string,
    target: {
      targetId: string
      targetType: FocusType
      salience: number
      intensity?: number
      estimatedDuration?: number
    },
    options?: {
      force?: boolean        // Override budget limits
      sessionId?: string
      contactId?: string
    },
  ): Promise<{
    acquired: boolean
    reason: string
    suppressed: string[]     // IDs of items that were suppressed to make room
    budgetAfter: AttentionalBudget
  }> {
    logInfo(TAG, 'acquire_focus_start', {
      workspaceId,
      targetType: target.targetType,
      targetId: target.targetId,
      salience: target.salience,
    })

    try {
      const budgetState = await AttentionalBudgetManager.getBudget(workspaceId)
      const { budget, suppressedSignals, shiftCount } = budgetState

      // ── Check shift cooldown ──
      const shiftRecord = await db.attentionalFocus.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        select: { lastShiftAt: true, focusTarget: true },
      })

      if (shiftRecord?.lastShiftAt) {
        const msSinceLastShift = Date.now() - shiftRecord.lastShiftAt.getTime()
        if (msSinceLastShift < COGNITIVE_DEFAULTS.ATTENTION.shiftCooldownMs && !options?.force) {
          return {
            acquired: false,
            reason: `Shift cooldown active (${msSinceLastShift}ms < ${COGNITIVE_DEFAULTS.ATTENTION.shiftCooldownMs}ms). Wait ${(COGNITIVE_DEFAULTS.ATTENTION.shiftCooldownMs - msSinceLastShift) / 1000}s.`,
            suppressed: [],
            budgetAfter: budget,
          }
        }
      }

      // ── Check if already focused on this target ──
      if (shiftRecord?.focusTarget === target.targetId) {
        return {
          acquired: true,
          reason: 'Already focused on this target. Focus renewed.',
          suppressed: [],
          budgetAfter: budget,
        }
      }

      // ── Compute cost of new focus ──
      const cost = ATTENTION_COSTS[target.targetType] ?? 0.2
      const availableAfter = budget.remaining - cost

      if (availableAfter < 0 && !options?.force) {
        // Try to suppress lower-salience items
        const canSuppress = budgetState.focusTargets.filter(
          (f) => f.salience < target.salience && f.targetId !== target.targetId,
        )

        if (canSuppress.length === 0) {
          return {
            acquired: false,
            reason: `Insufficient attention budget. Need ${cost.toFixed(2)}, have ${budget.remaining.toFixed(2)}. No lower-salience items to suppress.`,
            suppressed: [],
            budgetAfter: budget,
          }
        }

        // Suppress enough items to make room
        let freed = 0
        const suppressed: string[] = []
        for (const item of canSuppress) {
          const itemCost = ATTENTION_COSTS[item.targetType] ?? 0.1
          freed += itemCost
          suppressed.push(item.targetId)
          if (freed >= cost) break
        }
      }

      // ── Acquire focus ──
      const intensity = target.intensity ?? COGNITIVE_DEFAULTS.ATTENTION.defaultFocusIntensity
      const newUsed = Math.min(budget.total, budget.used + cost)

      // Upsert the focus record
      const existing = await db.attentionalFocus.findFirst({
        where: { workspaceId },
      })

      const focusData = {
        focusTarget: target.targetId,
        focusType: target.targetType,
        focusIntensity: intensity,
        attentionUsed: newUsed,
        attentionBudget: budget.total,
        shiftCount: shiftCount + 1,
        lastShiftAt: new Date(),
        sessionId: options?.sessionId ?? null,
        contactId: options?.contactId ?? null,
      }

      if (existing) {
        await db.attentionalFocus.update({
          where: { id: existing.id },
          data: focusData,
        })
      } else {
        await db.attentionalFocus.create({
          data: {
            workspaceId,
            ...focusData,
          },
        })
      }

      const newBudget: AttentionalBudget = {
        total: budget.total,
        used: newUsed,
        remaining: Math.max(0, budget.total - newUsed),
      }

      // Emit attention shift event
      try {
        await eventBus.emit(COGNITIVE_EVENTS.ATTENTION_SHIFT, {
          workspaceId,
          targetType: target.targetType,
          targetId: target.targetId,
          salience: target.salience,
          budgetRemaining: newBudget.remaining,
          shiftCount: shiftCount + 1,
        } as Record<string, unknown>, TAG)
      } catch {
        // Non-critical
      }

      logOk(TAG, 'focus_acquired', {
        workspaceId,
        targetType: target.targetType,
        targetId: target.targetId,
        budgetUsed: newUsed.toFixed(3),
        budgetRemaining: newBudget.remaining.toFixed(3),
      })

      return {
        acquired: true,
        reason: 'Focus acquired successfully.',
        suppressed: [],
        budgetAfter: newBudget,
      }
    } catch (err) {
      logError(TAG, 'acquire_focus_error', err, { workspaceId })
      return {
        acquired: false,
        reason: err instanceof Error ? err.message : 'Unknown error',
        suppressed: [],
        budgetAfter: { total: COGNITIVE_DEFAULTS.ATTENTION.maxBudget, used: 0, remaining: COGNITIVE_DEFAULTS.ATTENTION.maxBudget },
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. RELEASE FOCUS — Release attention from a target
  // Frees up budget and potentially restores suppressed items.
  // ─────────────────────────────────────────────────────────

  static async releaseFocus(
    workspaceId: string,
    targetId: string,
  ): Promise<{
    released: boolean
    budgetAfter: AttentionalBudget
  }> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
      })

      if (!record || record.focusTarget !== targetId) {
        return {
          released: false,
          budgetAfter: {
            total: COGNITIVE_DEFAULTS.ATTENTION.maxBudget,
            used: record?.attentionUsed ?? 0,
            remaining: COGNITIVE_DEFAULTS.ATTENTION.maxBudget - (record?.attentionUsed ?? 0),
          },
        }
      }

      // Compute cost to release
      const cost = ATTENTION_COSTS[record.focusType] ?? 0.2
      const newUsed = Math.max(0, record.attentionUsed - cost)

      await db.attentionalFocus.update({
        where: { id: record.id },
        data: {
          focusTarget: null,
          focusType: 'none',
          focusIntensity: 0.0,
          attentionUsed: newUsed,
        },
      })

      const budgetAfter: AttentionalBudget = {
        total: record.attentionBudget,
        used: newUsed,
        remaining: Math.max(0, record.attentionBudget - newUsed),
      }

      logOk(TAG, 'focus_released', {
        workspaceId,
        targetId,
        budgetUsed: newUsed.toFixed(3),
      })

      return { released: true, budgetAfter }
    } catch (err) {
      logError(TAG, 'release_focus_error', err, { workspaceId })
      return {
        released: false,
        budgetAfter: { total: COGNITIVE_DEFAULTS.ATTENTION.maxBudget, used: 0, remaining: COGNITIVE_DEFAULTS.ATTENTION.maxBudget },
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. SUPPRESS SIGNAL — Add a suppression signal
  // Suppresses a specific type of signal from attention.
  // Example: suppress 'emotion' signals when overloaded.
  // ─────────────────────────────────────────────────────────

  static async suppressSignal(
    workspaceId: string,
    signal: SuppressionSignal,
  ): Promise<void> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
      })

      if (!record) {
        await db.attentionalFocus.create({
          data: {
            workspaceId,
            suppressedSignals: JSON.stringify([signal]),
          },
        })
        return
      }

      let suppressed: SuppressionSignal[] = []
      try {
        suppressed = JSON.parse(record.suppressedSignals)
      } catch { /* empty */ }

      // Don't add duplicate suppressions
      const exists = suppressed.some((s) => s.signalType === signal.signalType)
      if (exists) return

      suppressed.push(signal)

      await db.attentionalFocus.update({
        where: { id: record.id },
        data: {
          suppressedSignals: JSON.stringify(suppressed),
        },
      })

      logInfo(TAG, 'signal_suppressed', {
        workspaceId,
        signalType: signal.signalType,
        reason: signal.reason,
      })
    } catch (err) {
      logError(TAG, 'suppress_signal_error', err, { workspaceId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. UNSUPPRESS — Remove a suppression signal
  // ─────────────────────────────────────────────────────────

  static async unsuppressSignal(
    workspaceId: string,
    signalType: string,
  ): Promise<void> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
      })

      if (!record) return

      let suppressed: SuppressionSignal[] = []
      try {
        suppressed = JSON.parse(record.suppressedSignals)
      } catch { return }

      suppressed = suppressed.filter((s) => s.signalType !== signalType)

      await db.attentionalFocus.update({
        where: { id: record.id },
        data: {
          suppressedSignals: JSON.stringify(suppressed),
        },
      })

      logInfo(TAG, 'signal_unsuppressed', { workspaceId, signalType })
    } catch (err) {
      logError(TAG, 'unsuppress_signal_error', err, { workspaceId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 6. IS SUPPRESSED — Check if a signal type is suppressed
  // ─────────────────────────────────────────────────────────

  static async isSuppressed(
    workspaceId: string,
    signalType: string,
  ): Promise<boolean> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
        select: { suppressedSignals: true },
      })

      if (!record) return false

      const suppressed: SuppressionSignal[] = JSON.parse(record.suppressedSignals)
      const now = Date.now()

      return suppressed.some((s) => {
        if (s.signalType !== signalType) return false
        // Check if suppression has expired
        if (s.expiresAt && new Date(s.expiresAt).getTime() < now) return false
        return true
      })
    } catch {
      return false
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. REDUCE BUDGET — When cognitive load increases, the
  // total attentional budget shrinks. This models how stress
  // reduces cognitive capacity.
  // ─────────────────────────────────────────────────────────

  static async reduceBudget(
    workspaceId: string,
    cognitiveLoad: number,
  ): Promise<{
    oldBudget: number
    newBudget: number
    suppressedByLoad: string[]
  }> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
      })

      // Budget shrinks as cognitive load increases
      // At 0 load, full budget. At 1.0 load, 20% budget remains.
      const newBudget = Math.max(
        0.20,
        COGNITIVE_DEFAULTS.ATTENTION.maxBudget * (1.0 - cognitiveLoad * 0.80),
      )

      const oldBudget = record?.attentionBudget ?? COGNITIVE_DEFAULTS.ATTENTION.maxBudget
      const suppressedByLoad: string[] = []

      // If budget dropped significantly, suppress low-salience items
      if (newBudget < oldBudget * 0.7 && record) {
        const typesToSuppress: FocusType[] = ['learning', 'system']
        for (const type of typesToSuppress) {
          await AttentionalBudgetManager.suppressSignal(workspaceId, {
            signalType: `focus_${type}`,
            reason: `Cognitive load (${cognitiveLoad.toFixed(2)}) exceeded threshold. Suppressing low-priority focus types.`,
            suppressedAt: new Date(),
            expiresAt: new Date(Date.now() + COGNITIVE_DEFAULTS.ATTENTION.suppressionTimeoutMs),
          })
          suppressedByLoad.push(type)
        }
      }

      if (record) {
        await db.attentionalFocus.update({
          where: { id: record.id },
          data: {
            attentionBudget: newBudget,
          },
        })
      } else {
        await db.attentionalFocus.create({
          data: {
            workspaceId,
            attentionBudget: newBudget,
            attentionUsed: 0,
          },
        })
      }

      logInfo(TAG, 'budget_reduced', {
        workspaceId,
        oldBudget: oldBudget.toFixed(3),
        newBudget: newBudget.toFixed(3),
        cognitiveLoad: cognitiveLoad.toFixed(3),
        suppressedByLoad: suppressedByLoad.length,
      })

      return { oldBudget, newBudget, suppressedByLoad }
    } catch (err) {
      logError(TAG, 'reduce_budget_error', err, { workspaceId })
      return { oldBudget: 1.0, newBudget: 1.0, suppressedByLoad: [] }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 8. RESTORE BUDGET — When cognitive load decreases, restore
  // the attentional budget and unsuppress items.
  // ─────────────────────────────────────────────────────────

  static async restoreBudget(
    workspaceId: string,
    cognitiveLoad: number,
  ): Promise<{
    oldBudget: number
    newBudget: number
    restored: string[]
  }> {
    try {
      const record = await db.attentionalFocus.findFirst({
        where: { workspaceId },
      })

      const newBudget = Math.max(
        0.20,
        COGNITIVE_DEFAULTS.ATTENTION.maxBudget * (1.0 - cognitiveLoad * 0.80),
      )

      const oldBudget = record?.attentionBudget ?? 1.0
      const restored: string[] = []

      // Restore suppressed items if budget improved significantly
      if (newBudget > oldBudget * 1.3) {
        const typesToRestore = ['learning', 'system']
        for (const type of typesToRestore) {
          await AttentionalBudgetManager.unsuppressSignal(workspaceId, `focus_${type}`)
          restored.push(type)
        }
      }

      if (record) {
        await db.attentionalFocus.update({
          where: { id: record.id },
          data: { attentionBudget: newBudget },
        })
      }

      logInfo(TAG, 'budget_restored', {
        workspaceId,
        oldBudget: oldBudget.toFixed(3),
        newBudget: newBudget.toFixed(3),
        restored: restored.length,
      })

      return { oldBudget, newBudget, restored }
    } catch (err) {
      logError(TAG, 'restore_budget_error', err, { workspaceId })
      return { oldBudget: 1.0, newBudget: 1.0, restored: [] }
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  private static inferLoadLevel(budget: AttentionalBudget): keyof typeof MAX_FOCUS_ITEMS {
    const utilization = budget.used / budget.total
    if (utilization >= 0.95) return 'overloaded'
    if (utilization >= 0.75) return 'high'
    if (utilization >= 0.50) return 'moderate'
    return 'optimal'
  }

  private static emptyBudget(): {
    budget: AttentionalBudget
    focusTargets: FocusTarget[]
    suppressedSignals: SuppressionSignal[]
    shiftCount: number
    maxFocusItems: number
  } {
    return {
      budget: {
        total: COGNITIVE_DEFAULTS.ATTENTION.maxBudget,
        used: 0,
        remaining: COGNITIVE_DEFAULTS.ATTENTION.maxBudget,
      },
      focusTargets: [],
      suppressedSignals: [],
      shiftCount: 0,
      maxFocusItems: MAX_FOCUS_ITEMS.optimal,
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default AttentionalBudgetManager
