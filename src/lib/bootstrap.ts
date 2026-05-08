// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Bootstrap / App Initialization
// This file wires up all event-driven systems at startup.
// It must be imported once from a server-side entry point.
// ═══════════════════════════════════════════════════════════════

import { logInfo, logOk, logError } from '@/lib/logger'

let _bootstrapped = false

/**
 * Initialize all background systems:
 *  1. Event Bus subscribers (ghosting → recovery, energy → emotional, etc.)
 *  2. Cron scheduler (NEXUS Life Engine, agent expiry, memory decay)
 *
 * Safe to call multiple times — no-ops after first call.
 */
export function bootstrapApp(): void {
  if (_bootstrapped) {
    return
  }
  _bootstrapped = true

  try {
    // 1. Register event bus subscribers
    const { registerEventSubscribers } = require('@/lib/event-bus-subscribers')
    registerEventSubscribers()
    logOk('SYSTEM', 'bootstrap: event subscribers registered')
  } catch (err) {
    logError('SYSTEM', 'bootstrap: event subscribers failed', err)
  }

  try {
    // 2. Start cron scheduler
    const { startCronScheduler } = require('@/lib/cron-scheduler')
    startCronScheduler()
    logOk('SYSTEM', 'bootstrap: cron scheduler started')
  } catch (err) {
    logError('SYSTEM', 'bootstrap: cron scheduler failed', err)
  }

  try {
    // 3. Start BullMQ workers (followups, events, AI tasks, sync, notifications)
    const { startWorkers } = require('@/lib/workers')
    startWorkers()
    logOk('SYSTEM', 'bootstrap: bullmq workers started')
  } catch (err) {
    logError('SYSTEM', 'bootstrap: bullmq workers failed', err)
  }

  logOk('SYSTEM', 'bootstrap: complete', { timestamp: new Date().toISOString() })
}

/**
 * Check if the app has been bootstrapped.
 */
export function isBootstrapped(): boolean {
  return _bootstrapped
}
