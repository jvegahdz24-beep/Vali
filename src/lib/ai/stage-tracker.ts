// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Stage Tracker (PERSISTED v2)
// FIX #4: Ahora persiste stage state en DB (conversation.metadata).
// Antes era solo in-memory (Map) — se perdía todo al reiniciar servidor.
//
// Estrategia: Dual-layer
//   - L1: In-memory Map para velocidad (lecturas en caliente)
//   - L2: conversation.metadata (JSON) para persistencia real
//   - Write-through: cada actualización escribe a ambos
//   - Read-miss: carga desde DB si no está en memoria
// ═══════════════════════════════════════════════════════════════

import type {
  ValiAutoFlowStage,
  ValiAutoFlowAgent,
  ValiAutoFlowStageState,
  ValiAutoFlowStageTransition,
} from '@/lib/types'
import { db } from '@/lib/db'
import { logInfo, logWarn } from '@/lib/logger'

// ─── In-Memory L1 Cache ──────────────────────────────────────
// Fast reads, auto-populated from DB on cache miss.

const stageStore = new Map<string, ValiAutoFlowStageState>()

// DB metadata key for stage state
const STAGE_META_KEY = 'valiautoflow_stage'

// ─── DB Persistence Helpers ───────────────────────────────────

async function loadFromDB(conversationId: string): Promise<ValiAutoFlowStageState | null> {
  try {
    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    })
    if (!conv) return null

    const meta = typeof conv.metadata === 'string'
      ? JSON.parse(conv.metadata || '{}')
      : (conv.metadata || {})

    const stageData = meta[STAGE_META_KEY]
    if (!stageData) return null

    // Reconstruct dates from ISO strings
    return {
      ...stageData,
      stageEnteredAt: new Date(stageData.stageEnteredAt),
      history: (stageData.history || []).map((t: any) => ({
        ...t,
        timestamp: new Date(t.timestamp),
      })),
    } as ValiAutoFlowStageState
  } catch (err) {
    logWarn('STAGE_TRACKER', 'db_load_failed', {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function saveToDB(conversationId: string, state: ValiAutoFlowStageState): Promise<void> {
  try {
    const conv = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    })
    if (!conv) return

    const meta = typeof conv.metadata === 'string'
      ? JSON.parse(conv.metadata || '{}')
      : (conv.metadata || {})

    meta[STAGE_META_KEY] = {
      ...state,
      // Dates are serialized to ISO strings for JSON storage
      stageEnteredAt: state.stageEnteredAt.toISOString(),
      history: state.history.map(t => ({
        ...t,
        timestamp: t.timestamp.toISOString(),
      })),
    }

    await db.conversation.update({
      where: { id: conversationId },
      data: { metadata: JSON.stringify(meta) },
    })
  } catch (err) {
    // Non-fatal: L1 cache still works, DB write is best-effort
    logWarn('STAGE_TRACKER', 'db_save_failed', {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── Stage Tracker Class ─────────────────────────────────────

export class StageTracker {
  /**
   * Get or create a stage state for a conversation.
   * L1 cache first, then L2 DB on cache miss.
   */
  async getStageState(conversationId: string): Promise<ValiAutoFlowStageState> {
    // L1: Check memory cache
    const cached = stageStore.get(conversationId)
    if (cached) return cached

    // L2: Load from DB
    const dbState = await loadFromDB(conversationId)
    if (dbState) {
      stageStore.set(conversationId, dbState)
      return dbState
    }

    // Create new state
    const newState: ValiAutoFlowStageState = {
      conversationId,
      currentStage: 'exploration',
      agent: 'diagnostico',
      history: [],
      stageEnteredAt: new Date(),
      messagesInStage: 0,
      painDetected: false,
      costAcknowledged: false,
    }

    stageStore.set(conversationId, newState)
    // Persist new state to DB
    await saveToDB(conversationId, newState)
    return newState
  }

  /**
   * Sync getStageState for backward compatibility (non-async callers).
   * Falls back to L1 cache only — does NOT wait for DB.
   */
  getStageStateSync(conversationId: string): ValiAutoFlowStageState {
    const cached = stageStore.get(conversationId)
    if (cached) return cached

    // Return default state — async version will load from DB later
    const defaultState: ValiAutoFlowStageState = {
      conversationId,
      currentStage: 'exploration',
      agent: 'diagnostico',
      history: [],
      stageEnteredAt: new Date(),
      messagesInStage: 0,
      painDetected: false,
      costAcknowledged: false,
    }
    stageStore.set(conversationId, defaultState)
    return defaultState
  }

  /**
   * Update the stage for a conversation.
   * Write-through: updates both L1 cache and L2 DB.
   */
  async updateStage(
    conversationId: string,
    newStage: ValiAutoFlowStage,
    newAgent: ValiAutoFlowAgent,
    triggeredBy: string,
    confidence: number,
    options?: {
      painDetected?: boolean
      costAcknowledged?: boolean
    }
  ): Promise<ValiAutoFlowStageState> {
    const state = await this.getStageState(conversationId)

    // Only create transition if stage actually changed
    if (state.currentStage !== newStage) {
      const transition: ValiAutoFlowStageTransition = {
        from: state.currentStage,
        to: newStage,
        timestamp: new Date(),
        triggeredBy,
        confidence,
      }

      state.history.push(transition)
      state.currentStage = newStage
      state.agent = newAgent
      state.stageEnteredAt = new Date()
      state.messagesInStage = 0

      logInfo('STAGE_TRACKER', 'stage_transition', {
        conversationId,
        from: transition.from,
        to: newStage,
        confidence,
      })
    }

    // Update detection flags
    if (options?.painDetected !== undefined) {
      state.painDetected = options.painDetected
    }
    if (options?.costAcknowledged !== undefined) {
      state.costAcknowledged = options.costAcknowledged
    }

    // Increment message counter for current stage
    state.messagesInStage += 1

    // Write-through: update both L1 and L2
    stageStore.set(conversationId, state)
    await saveToDB(conversationId, state)
    return state
  }

  /**
   * Increment the message counter without changing stage.
   * Write-through: updates both L1 cache and L2 DB.
   */
  async incrementMessages(
    conversationId: string,
    options?: {
      painDetected?: boolean
      costAcknowledged?: boolean
    }
  ): Promise<ValiAutoFlowStageState> {
    const state = await this.getStageState(conversationId)
    state.messagesInStage += 1

    if (options?.painDetected !== undefined) {
      state.painDetected = options.painDetected
    }
    if (options?.costAcknowledged !== undefined) {
      state.costAcknowledged = options.costAcknowledged
    }

    // Write-through
    stageStore.set(conversationId, state)
    await saveToDB(conversationId, state)
    return state
  }

  /**
   * Get the duration of the current stage in milliseconds.
   */
  getStageDuration(conversationId: string): number {
    const state = stageStore.get(conversationId)
    if (!state) return 0
    return Date.now() - state.stageEnteredAt.getTime()
  }

  /**
   * Get the stage duration formatted as a human-readable string.
   */
  getStageDurationFormatted(conversationId: string): string {
    const ms = this.getStageDuration(conversationId)
    const minutes = Math.floor(ms / 60000)
    if (minutes < 1) return 'menos de 1 min'
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  /**
   * Get the full stage history for a conversation.
   */
  async getStageHistory(conversationId: string): Promise<ValiAutoFlowStageTransition[]> {
    const state = await this.getStageState(conversationId)
    return state?.history || []
  }

  /**
   * Get analytics for a specific conversation.
   */
  async getAnalytics(conversationId: string): Promise<{
    currentStage: ValiAutoFlowStage
    currentAgent: ValiAutoFlowAgent
    messagesInStage: number
    stageDuration: string
    totalTransitions: number
    painDetected: boolean
    costAcknowledged: boolean
    avgMessagesPerStage: number
  }> {
    const state = await this.getStageState(conversationId)
    const totalMessages = state.history.reduce(
      (sum, _t) => sum + 1,
      state.messagesInStage
    )
    const totalStages = state.history.length + 1
    const avgMessages = totalStages > 0 ? Math.round(totalMessages / totalStages) : 0

    return {
      currentStage: state.currentStage,
      currentAgent: state.agent,
      messagesInStage: state.messagesInStage,
      stageDuration: this.getStageDurationFormatted(conversationId),
      totalTransitions: state.history.length,
      painDetected: state.painDetected,
      costAcknowledged: state.costAcknowledged,
      avgMessagesPerStage: avgMessages,
    }
  }

  /**
   * Get global analytics across all conversations.
   * Only counts in-memory conversations (hot cache).
   */
  getGlobalAnalytics(): {
    totalConversations: number
    stageDistribution: Record<ValiAutoFlowStage, number>
    avgTransitions: number
    conversationsWithPain: number
    conversationsWithCostAck: number
  } {
    const conversations = Array.from(stageStore.values())
    const totalConversations = conversations.length

    const stageDistribution: Record<ValiAutoFlowStage, number> = {
      exploration: 0,
      interest: 0,
      intention: 0,
    }

    let totalTransitions = 0
    let conversationsWithPain = 0
    let conversationsWithCostAck = 0

    for (const conv of conversations) {
      stageDistribution[conv.currentStage]++
      totalTransitions += conv.history.length
      if (conv.painDetected) conversationsWithPain++
      if (conv.costAcknowledged) conversationsWithCostAck++
    }

    return {
      totalConversations,
      stageDistribution,
      avgTransitions: totalConversations > 0 ? Math.round(totalTransitions / totalConversations * 10) / 10 : 0,
      conversationsWithPain,
      conversationsWithCostAck,
    }
  }

  /**
   * Clear a conversation's stage state (L1 + L2).
   */
  async clearConversation(conversationId: string): Promise<void> {
    stageStore.delete(conversationId)
    try {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { metadata: true },
      })
      if (!conv) return
      const meta = typeof conv.metadata === 'string'
        ? JSON.parse(conv.metadata || '{}')
        : (conv.metadata || {})
      delete meta[STAGE_META_KEY]
      await db.conversation.update({
        where: { id: conversationId },
        data: { metadata: JSON.stringify(meta) },
      })
    } catch {
      // Non-fatal
    }
  }

  /**
   * Clear all stored stage states (L1 only — DB data preserved for analytics).
   */
  clearAll(): void {
    stageStore.clear()
  }

  /**
   * Get total number of tracked conversations in L1 cache.
   */
  size(): number {
    return stageStore.size
  }

  /**
   * Pre-warm cache from DB for a set of active conversations.
   * Call on server startup to restore state from previous session.
   */
  async warmCache(limit: number = 100): Promise<number> {
    try {
      const activeConvs = await db.conversation.findMany({
        where: { status: 'active' },
        select: { id: true, metadata: true },
        orderBy: { lastMessageAt: 'desc' },
        take: limit,
      })

      let loaded = 0
      for (const conv of activeConvs) {
        const meta = typeof conv.metadata === 'string'
          ? JSON.parse(conv.metadata || '{}')
          : (conv.metadata || {})

        const stageData = meta[STAGE_META_KEY]
        if (stageData) {
          const state: ValiAutoFlowStageState = {
            ...stageData,
            stageEnteredAt: new Date(stageData.stageEnteredAt),
            history: (stageData.history || []).map((t: any) => ({
              ...t,
              timestamp: new Date(t.timestamp),
            })),
          }
          stageStore.set(conv.id, state)
          loaded++
        }
      }

      if (loaded > 0) {
        logInfo('STAGE_TRACKER', 'cache_warmed', { loaded, total: activeConvs.length })
      }
      return loaded
    } catch (err) {
      logWarn('STAGE_TRACKER', 'warm_cache_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return 0
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const stageTracker = new StageTracker()

// Auto-warm cache on module load (non-blocking)
stageTracker.warmCache().catch(() => {
  // Silent fail — cache warming is nice-to-have
})
