// ═══════════════════════════════════════════════════════════════
// NEXUS Cron Scheduler — Recurring task runner for the Life Engine
// Uses setInterval for simplicity (no external cron library).
// All tasks wrapped in try/catch for resilience.
// ═══════════════════════════════════════════════════════════════

import { runLifeEngineCycle } from '@/lib/nexus-life-engine'
import { expireStaleAgents } from '@/lib/ephemeral-agents'
import { applyMemoryDecay } from '@/lib/memory-engine'
import { logInfo, logWarn, logError } from '@/lib/logger'

// ─── Types ──────────────────────────────────────────────────────

export interface CronStatus {
  running: boolean
  startedAt: string | null
  lastRuns: {
    lifeEngine: string | null
    staleAgents: string | null
    memoryDecay: string | null
  }
  intervals: {
    lifeEngineMs: number
    staleAgentsMs: number
    memoryDecayMs: number
  }
  errorCounts: {
    lifeEngine: number
    staleAgents: number
    memoryDecay: number
  }
}

// ─── Interval Configurations ───────────────────────────────────

/** Life Engine cycle: every 4 hours */
const LIFE_ENGINE_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Expire stale ephemeral agents: every 15 minutes */
const STALE_AGENTS_INTERVAL_MS = 15 * 60 * 1000

/** Memory decay: every 24 hours */
const MEMORY_DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000

// ─── State ─────────────────────────────────────────────────────

let isRunning = false
let startedAt: string | null = null

const lastRuns = {
  lifeEngine: null as string | null,
  staleAgents: null as string | null,
  memoryDecay: null as string | null,
}

const errorCounts = {
  lifeEngine: 0,
  staleAgents: 0,
  memoryDecay: 0,
}

let lifeEngineTimer: ReturnType<typeof setInterval> | null = null
let staleAgentsTimer: ReturnType<typeof setInterval> | null = null
let memoryDecayTimer: ReturnType<typeof setInterval> | null = null

// ─── Task Runners ──────────────────────────────────────────────

async function runLifeEngineTask(): Promise<void> {
  try {
    logInfo('SYSTEM', 'life_engine_cycle_triggered', {})
    const result = await runLifeEngineCycle()
    lastRuns.lifeEngine = new Date().toISOString()
    logInfo('SYSTEM', 'life_engine_cycle_completed', {
      usersProcessed: result.usersProcessed,
      microFollowUps: result.microFollowUps,
      deepMessages: result.deepMessages,
      silencesDetected: result.silencesDetected,
      energyUpdates: result.energyUpdates,
      patternsDetected: result.patternsDetected,
      errorCount: result.errors.length,
    })
  } catch (err) {
    errorCounts.lifeEngine++
    logError('SYSTEM', 'life_engine_cycle_failed', err)
  }
}

async function runExpireStaleAgentsTask(): Promise<void> {
  try {
    logInfo('SYSTEM', 'expire_stale_agents_triggered', {})
    const expiredCount = await expireStaleAgents()
    lastRuns.staleAgents = new Date().toISOString()
    if (expiredCount > 0) {
      logInfo('SYSTEM', 'expire_stale_agents_completed', { expiredCount })
    }
  } catch (err) {
    errorCounts.staleAgents++
    logError('SYSTEM', 'expire_stale_agents_failed', err)
  }
}

async function runMemoryDecayTask(): Promise<void> {
  try {
    logInfo('SYSTEM', 'memory_decay_triggered', {})
    const result = await applyMemoryDecay()
    lastRuns.memoryDecay = new Date().toISOString()
    if (result.decayed > 0 || result.archived > 0) {
      logInfo('SYSTEM', 'memory_decay_completed', {
        decayed: result.decayed,
        archived: result.archived,
      })
    }
  } catch (err) {
    errorCounts.memoryDecay++
    logError('SYSTEM', 'memory_decay_failed', err)
  }
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Start all cron jobs. Safe to call multiple times — no-ops if already running.
 */
export function startCronScheduler(): void {
  if (isRunning) {
    logInfo('SYSTEM', 'start_skipped', { reason: 'already_running' })
    return
  }

  isRunning = true
  startedAt = new Date().toISOString()

  // Life Engine: every 4 hours
  lifeEngineTimer = setInterval(() => {
    runLifeEngineTask()
  }, LIFE_ENGINE_INTERVAL_MS)

  // Stale agent expiry: every 15 minutes
  staleAgentsTimer = setInterval(() => {
    runExpireStaleAgentsTask()
  }, STALE_AGENTS_INTERVAL_MS)

  // Memory decay: every 24 hours
  memoryDecayTimer = setInterval(() => {
    runMemoryDecayTask()
  }, MEMORY_DECAY_INTERVAL_MS)

  logInfo('SYSTEM', 'scheduler_started', {
    lifeEngineInterval: '4h',
    staleAgentsInterval: '15m',
    memoryDecayInterval: '24h',
  })

  // Run each task once immediately on start (with a small stagger to avoid burst)
  setTimeout(() => runLifeEngineTask(), 2_000)
  setTimeout(() => runExpireStaleAgentsTask(), 10_000)
  setTimeout(() => runMemoryDecayTask(), 30_000)
}

/**
 * Stop all cron jobs.
 */
export function stopCronScheduler(): void {
  if (!isRunning) {
    logInfo('SYSTEM', 'stop_skipped', { reason: 'not_running' })
    return
  }

  if (lifeEngineTimer) {
    clearInterval(lifeEngineTimer)
    lifeEngineTimer = null
  }
  if (staleAgentsTimer) {
    clearInterval(staleAgentsTimer)
    staleAgentsTimer = null
  }
  if (memoryDecayTimer) {
    clearInterval(memoryDecayTimer)
    memoryDecayTimer = null
  }

  isRunning = false
  logInfo('SYSTEM', 'scheduler_stopped', {})
}

/**
 * Get the current cron scheduler status.
 */
export function getCronStatus(): CronStatus {
  return {
    running: isRunning,
    startedAt,
    lastRuns: { ...lastRuns },
    intervals: {
      lifeEngineMs: LIFE_ENGINE_INTERVAL_MS,
      staleAgentsMs: STALE_AGENTS_INTERVAL_MS,
      memoryDecayMs: MEMORY_DECAY_INTERVAL_MS,
    },
    errorCounts: { ...errorCounts },
  }
}
