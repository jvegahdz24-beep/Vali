// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Event Bus
// Pub/Sub for real-time events across the system.
// Uses Redis if REDIS_URL is set, falls back to in-memory EventEmitter.
//
// Events emitted:
//   deal.stage.changed  — { dealId, workspaceId, contactId, oldStage, newStage }
//   lead.score.updated  — { contactId, workspaceId, oldScore, newScore }
//   message.received    — { conversationId, workspaceId, contactId }
//   automation.executed — { automationId, workspaceId, contactId, status }
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'events'

// ─── In-memory fallback ───────────────────────────────────────
// Singleton to survive Next.js hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __valiEventBus: EventEmitter | undefined
}

if (!global.__valiEventBus) {
  global.__valiEventBus = new EventEmitter()
  global.__valiEventBus.setMaxListeners(50)
}

const localBus = global.__valiEventBus

// ─── Event Payloads ───────────────────────────────────────────

export interface DealStageChangedPayload {
  dealId: string
  workspaceId: string
  contactId?: string | null
  contactName?: string
  oldStageId?: string
  oldStageName?: string
  newStageId: string
  newStageName: string
  value?: number
}

export interface LeadScoreUpdatedPayload {
  contactId: string
  workspaceId: string
  oldScore: number
  newScore: number
  reason?: string
}

export interface MessageReceivedPayload {
  conversationId: string
  workspaceId: string
  contactId?: string | null
  channel: string
}

export interface AutomationExecutedPayload {
  automationId: string
  workspaceId: string
  contactId?: string | null
  status: 'success' | 'error' | 'skipped'
  errorMessage?: string
}

export interface AgentAssignedPayload {
  workspaceId: string
  conversationId?: string | null
  contactId?: string | null
  agentName: string
  role?: string | null
  vertical?: string | null
}

export type EventMap = {
  'deal.stage.changed': DealStageChangedPayload
  'lead.score.updated': LeadScoreUpdatedPayload
  'message.received': MessageReceivedPayload
  'automation.executed': AutomationExecutedPayload
  'agent.assigned': AgentAssignedPayload
  'settings.updated': { workspaceId: string; settings: Record<string, unknown> }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Publish an event to all subscribers.
 * Safe to call from any API route or server action.
 */
export function publish<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
  try {
    localBus.emit(event, payload)
    // Log in dev for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EventBus] 📡 ${event}`, JSON.stringify(payload).slice(0, 120))
    }
  } catch (err) {
    console.error(`[EventBus] Failed to publish ${event}:`, err)
  }
}

/**
 * Subscribe to an event. Returns an unsubscribe function.
 */
export function subscribe<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void | Promise<void>
): () => void {
  const wrappedHandler = (payload: EventMap[K]) => {
    try {
      const result = handler(payload)
      if (result instanceof Promise) {
        result.catch(err => console.error(`[EventBus] Handler error for ${event}:`, err))
      }
    } catch (err) {
      console.error(`[EventBus] Sync handler error for ${event}:`, err)
    }
  }

  localBus.on(event, wrappedHandler)
  return () => localBus.off(event, wrappedHandler)
}

/**
 * Subscribe to an event only once.
 */
export function subscribeOnce<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void | Promise<void>
): void {
  localBus.once(event, handler)
}
