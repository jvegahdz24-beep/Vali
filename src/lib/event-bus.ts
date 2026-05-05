// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Event Bus
// A real, typed, event-driven system with:
//   - EventEmitter-based with TypeScript generics
//   - Prisma persistence (EventLog) for audit & replay
//   - Dead Letter Queue (DLQ) for failed events
//   - Async middleware pipeline (transform / filter)
//   - Wildcard '*' subscribers for monitoring
//   - Error isolation between handlers
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'events'
import { db } from '@/lib/db'
import { logWarn, logError } from '@/lib/logger'

// ─────────────────────────────────────────────────────────────
// Event Type Definitions
// ─────────────────────────────────────────────────────────────

export const EVENT_TYPES = {
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  EMOTION_DETECTED: 'emotion.detected',
  MEMORY_STORED: 'memory.stored',
  AGENT_INVOKED: 'agent.invoked',
  AGENT_RESPONDED: 'agent.responded',
  CONTACT_UPDATED: 'contact.updated',
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  FOLLOWUP_CREATED: 'followup.created',
  NEXUS_TEMPERATURE_CHANGED: 'nexus.temperature_changed',
  NEXUS_ENERGY_CHANGED: 'nexus.energy_changed',
  NEXUS_SILENCE_DETECTED: 'nexus.silence_detected',
  NEXUS_FOLLOWUP_GENERATED: 'nexus.followup_generated',
  NEXUS_PATTERN_DETECTED: 'nexus.pattern_detected',
  AUTOMATION_TRIGGERED: 'automation.triggered',
  GHOSTING_DETECTED: 'ghosting.detected',
  SYSTEM_ERROR: 'system.error',
  TOOL_CALLED: 'tool.called',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES] | string

// ─────────────────────────────────────────────────────────────
// Event Payload Definitions (typed per event type)
// ─────────────────────────────────────────────────────────────

export interface EventPayloadMap {
  'message.received': {
    messageId: string
    conversationId: string
    contactId?: string
    channel: string
    content: string
    externalId?: string
  }
  'message.sent': {
    messageId: string
    conversationId: string
    contactId?: string
    channel: string
    content: string
    isAiGenerated?: boolean
  }
  'emotion.detected': {
    contactId?: string
    conversationId: string
    emotion: string
    confidence: number
    messageId?: string
  }
  'memory.stored': {
    memoryId: string
    contactId?: string
    key: string
    source: string
    agentId?: string
  }
  'agent.invoked': {
    agentId: string
    agentType: string
    conversationId: string
    input: string
  }
  'agent.responded': {
    agentId: string
    agentType: string
    conversationId: string
    response: string
    latencyMs: number
    confidence?: number
  }
  'contact.updated': {
    contactId: string
    workspaceId: string
    changes: Record<string, { old: unknown; new: unknown }>
    reason?: string
  }
  'deal.stage_changed': {
    dealId: string
    workspaceId: string
    contactId?: string
    fromStageId?: string
    toStageId: string
    toStageName: string
    value?: number
  }
  'followup.created': {
    taskId: string
    contactId: string
    conversationId: string
    ruleId: string
    scheduledAt: string
    channel: string
  }
  'nexus.temperature_changed': {
    userId: string
    oldValue: number
    newValue: number
    source: string
    reason?: string
  }
  'nexus.energy_changed': {
    userId: string
    oldScore: number
    newScore: number
    breakdown: Record<string, number>
    label?: string
  }
  'nexus.silence_detected': {
    userId: string
    contactId?: string
    contactName?: string
    hoursSilent: number
    expectedInterval: number
    urgencyLevel: string
  }
  'nexus.followup_generated': {
    userId: string
    followUpId: string
    type: string
    contactId?: string
    contactName?: string
    content: string
  }
  'nexus.pattern_detected': {
    userId: string
    patternType: string
    patternName: string
    confidence: number
    description: string
  }
  'automation.triggered': {
    automationId: string
    workspaceId: string
    triggerType: string
    contactId?: string
    actions: unknown[]
  }
  'ghosting.detected': {
    contactId: string
    conversationId: string
    workspaceId: string
    hoursSinceLastMessage: number
    lastStage?: string
  }
  'system.error': {
    error: string
    stack?: string
    context?: string
    source?: string
  }
  'tool.called': {
    toolName: string
    conversationId: string
    agentId?: string
    input: unknown
    output?: unknown
    latencyMs?: number
    success: boolean
  }
  // Fallback for any unknown event type
  [key: string]: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────
// Event Envelope — wraps every emitted event
// ─────────────────────────────────────────────────────────────

export interface EventEnvelope<T extends EventType = EventType> {
  id: string          // unique event ID (cuid)
  type: T
  source: string      // who emitted: system, engine, whatsapp, ai, automation
  payload: EventPayloadMap[T]
  timestamp: Date
  metadata?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────
// Event Middleware
// ─────────────────────────────────────────────────────────────

export type EventMiddleware<T extends EventType = EventType> = (
  event: EventEnvelope<T>,
) => Promise<EventEnvelope<T> | null> // return null to filter/drop the event

// ─────────────────────────────────────────────────────────────
// Event Handler
// ─────────────────────────────────────────────────────────────

export type EventHandler<T extends EventType = EventType> = (
  event: EventEnvelope<T>,
) => Promise<void> | void

// ─────────────────────────────────────────────────────────────
// Dead Letter Queue Entry
// ─────────────────────────────────────────────────────────────

export interface DLQEntry {
  event: EventEnvelope
  error: string
  handlerName: string
  retryCount: number
  lastAttemptAt: Date
  nextRetryAt: Date
}

// ─────────────────────────────────────────────────────────────
// EventBus Options
// ─────────────────────────────────────────────────────────────

export interface EventBusOptions {
  /** Enable Prisma persistence (default: true) */
  persistToDb?: boolean
  /** Max retries for DLQ entries before discarding (default: 5) */
  maxRetries?: number
  /** Delay between DLQ retries in ms (default: 60_000 = 1min) */
  retryDelayMs?: number
  /** Max listeners before warning (default: 50) */
  maxListeners?: number
}

// ═══════════════════════════════════════════════════════════════
// EventBus — Singleton class
// ═══════════════════════════════════════════════════════════════

class EventBus {
  private emitter: EventEmitter
  private middlewares: EventMiddleware[] = []
  private dlq: DLQEntry[] = []
  private handlerRegistry: Map<string, Set<EventHandler>> = new Map()
  private options: Required<EventBusOptions>
  private _isProcessingDLQ: boolean = false

  constructor(options: EventBusOptions = {}) {
    this.emitter = new EventEmitter()
    this.options = {
      persistToDb: options.persistToDb ?? true,
      maxRetries: options.maxRetries ?? 5,
      retryDelayMs: options.retryDelayMs ?? 60_000,
      maxListeners: options.maxListeners ?? 50,
    }
    this.emitter.setMaxListeners(this.options.maxListeners)

    // Bind error handler to prevent uncaught exceptions crashing the process
    this.emitter.on('error', (err) => {
      logError('EVENT_BUS', 'emitter_error', err)
    })
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  /**
   * Emit an event. Runs through middleware pipeline, then dispatches
   * to all matching handlers asynchronously with error isolation.
   */
  async emit<T extends EventType>(
    type: T,
    payload: EventPayloadMap[T],
    source: string = 'system',
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    // Generate event envelope
    const envelope: EventEnvelope<T> = {
      id: generateEventId(),
      type,
      source,
      payload,
      timestamp: new Date(),
      metadata,
    }

    // Run through middleware pipeline (sync first, then async)
    const processedEnvelope = await this.runMiddleware(envelope)
    if (!processedEnvelope) {
      // Middleware filtered/dropped the event — still persist but mark processed
      await this.persistEvent(envelope, true)
      return envelope.id
    }

    // Persist to DB
    await this.persistEvent(processedEnvelope, false)

    // Dispatch to handlers asynchronously
    this.dispatchToHandlers(processedEnvelope).catch((err) => {
      logError('EVENT_BUS', 'dispatch_error', err, { eventType: processedEnvelope.type })
    })

    // Also emit on the raw EventEmitter for wildcard and legacy subscribers
    try {
      this.emitter.emit(processedEnvelope.type, processedEnvelope)
      this.emitter.emit('*', processedEnvelope) // wildcard
    } catch (err) {
      logError('EVENT_BUS', 'emitter_emit_error', err)
    }

    return processedEnvelope.id
  }

  /**
   * Subscribe to an event type. Returns unsubscribe function.
   * Use '*' to subscribe to ALL events.
   */
  on<T extends EventType>(
    type: T | '*',
    handler: EventHandler<T>,
  ): () => void {
    const key = type
    if (!this.handlerRegistry.has(key)) {
      this.handlerRegistry.set(key, new Set())
    }
    this.handlerRegistry.get(key)!.add(handler as EventHandler)

    return () => this.off(type, handler)
  }

  /**
   * Unsubscribe a handler from an event type.
   */
  off<T extends EventType>(
    type: T | '*',
    handler: EventHandler<T>,
  ): void {
    const key = type
    const handlers = this.handlerRegistry.get(key)
    if (handlers) {
      handlers.delete(handler as EventHandler)
      if (handlers.size === 0) {
        this.handlerRegistry.delete(key)
      }
    }
  }

  /**
   * Subscribe to an event type, but auto-unsubscribe after first invocation.
   */
  once<T extends EventType>(
    type: T | '*',
    handler: EventHandler<T>,
  ): () => void {
    const wrapper: EventHandler<T> = async (event) => {
      await this.off(type, wrapper)
      return handler(event)
    }
    return this.on(type, wrapper)
  }

  /**
   * Add middleware that runs before handlers.
   * Middleware can transform or filter (return null to drop) events.
   */
  use<T extends EventType = EventType>(middleware: EventMiddleware<T>): () => void {
    this.middlewares.push(middleware as unknown as EventMiddleware)
    return () => {
      const idx = this.middlewares.indexOf(middleware as unknown as EventMiddleware)
      if (idx >= 0) this.middlewares.splice(idx, 1)
    }
  }

  /**
   * Remove all middleware.
   */
  clearMiddleware(): void {
    this.middlewares = []
  }

  /**
   * Remove all handlers for a specific event type (or all if omitted).
   */
  removeAllListeners(type?: EventType | '*'): void {
    if (type) {
      this.handlerRegistry.delete(type)
      this.emitter.removeAllListeners(type)
    } else {
      this.handlerRegistry.clear()
      this.emitter.removeAllListeners()
    }
  }

  // ─────────────────────────────────────────────────────────
  // DEAD LETTER QUEUE
  // ─────────────────────────────────────────────────────────

  /**
   * Get all entries in the Dead Letter Queue.
   */
  getDLQ(): DLQEntry[] {
    return [...this.dlq]
  }

  /**
   * Get count of DLQ entries.
   */
  getDLQSize(): number {
    return this.dlq.length
  }

  /**
   * Retry all DLQ entries that are due.
   * Returns the number of successfully retried entries.
   */
  async retryDLQ(): Promise<{ retried: number; failed: number; discarded: number }> {
    if (this._isProcessingDLQ) return { retried: 0, failed: 0, discarded: 0 }
    this._isProcessingDLQ = true

    let retried = 0
    let failed = 0
    let discarded = 0
    const now = Date.now()

    const remaining: DLQEntry[] = []

    for (const entry of this.dlq) {
      // Check if max retries exceeded BEFORE attempting
      if (entry.retryCount >= this.options.maxRetries) {
        discarded++
        logWarn('EVENT_BUS', 'dlq_discarded', {
          eventId: entry.event.id,
          eventType: entry.event.type,
          retries: entry.retryCount,
        })
        continue
      }

      // Not yet due for retry
      if (now < entry.nextRetryAt.getTime()) {
        remaining.push(entry)
        continue
      }

      // Directly invoke handlers (bypassing dispatchToHandlers to avoid
      // double-DLQ-add). Manually manage the DLQ entry lifecycle.
      const newRetryCount = entry.retryCount + 1
      let handlerSucceeded = false

      try {
        const handlers: EventHandler[] = []
        const specificHandlers = this.handlerRegistry.get(entry.event.type)
        const wildcardHandlers = this.handlerRegistry.get('*')
        if (specificHandlers) handlers.push(...specificHandlers)
        if (wildcardHandlers) handlers.push(...wildcardHandlers)

        const results = await Promise.allSettled(
          handlers.map(async (handler) => {
            try {
              await handler(entry.event)
              return { success: true }
            } catch (err) {
              return { success: false, error: err instanceof Error ? err.message : String(err) }
            }
          }),
        )

        handlerSucceeded = results.some(
          (r) => r.status === 'fulfilled' && r.value.success,
        )
      } catch (err) {
        // Unexpected error in the retry logic itself
        failed++
        remaining.push({
          ...entry,
          retryCount: newRetryCount,
          lastAttemptAt: new Date(),
          nextRetryAt: new Date(now + this.options.retryDelayMs * Math.pow(2, entry.retryCount)),
        })
        continue
      }

      if (handlerSucceeded) {
        retried++
      } else {
        failed++
        // Re-queue with incremented retry count and exponential backoff
        remaining.push({
          ...entry,
          retryCount: newRetryCount,
          lastAttemptAt: new Date(),
          nextRetryAt: new Date(now + this.options.retryDelayMs * Math.pow(2, entry.retryCount)),
        })
      }
    }

    this.dlq = remaining
    this._isProcessingDLQ = false

    return { retried, failed, discarded }
  }

  /**
   * Clear the DLQ (e.g., for testing).
   */
  clearDLQ(): void {
    this.dlq = []
  }

  // ─────────────────────────────────────────────────────────
  // REPLAY — Re-emit persisted events
  // ─────────────────────────────────────────────────────────

  /**
   * Replay events from the DB from a given start time.
   * Re-dispatches through the normal handler pipeline.
   */
  async replayEvents(
    startTime: Date,
    eventTypes?: EventType[],
    limit: number = 100,
  ): Promise<number> {
    const events = await db.eventLog.findMany({
      where: {
        createdAt: { gte: startTime },
        ...(eventTypes ? { type: { in: eventTypes } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })

    let replayed = 0
    for (const log of events) {
      try {
        const payload = JSON.parse(log.payload) as Record<string, unknown>
        const envelope: EventEnvelope = {
          id: log.id,
          type: log.type,
          source: log.source,
          payload,
          timestamp: log.createdAt,
          metadata: { replayed: true, originalCreatedAt: log.createdAt.toISOString() },
        }
        await this.dispatchToHandlers(envelope)
        replayed++
      } catch (err) {
        logError('EVENT_BUS', 'replay_error', err, { eventLogId: log.id })
      }
    }

    return replayed
  }

  /**
   * Get failed (unprocessed) events from the DB for manual inspection.
   */
  async getFailedEvents(limit: number = 50): Promise<
    { id: string; type: string; source: string; payload: string; error: string | null; createdAt: Date }[]
  > {
    return db.eventLog.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  // ─────────────────────────────────────────────────────────
  // INTERNALS
  // ─────────────────────────────────────────────────────────

  /**
   * Run event through all middleware. Returns null if filtered out.
   */
  private async runMiddleware<T extends EventType>(
    event: EventEnvelope<T>,
  ): Promise<EventEnvelope<T> | null> {
    let current: EventEnvelope<T> | null = event

    for (const middleware of this.middlewares) {
      if (!current) break
      try {
        current = (await middleware(current)) as EventEnvelope<T> | null
      } catch (err) {
        logError('EVENT_BUS', 'middleware_error', err, { eventType: event.type })
        // Continue with the last good value — don't let a broken middleware kill the pipeline
      }
    }

    return current
  }

  /**
   * Dispatch event to all registered handlers with error isolation.
   * Each handler failure is isolated — others still run.
   * Failed events go to the DLQ for retry.
   */
  private async dispatchToHandlers<T extends EventType>(
    event: EventEnvelope<T>,
    _skipDLQ: boolean = false,
  ): Promise<void> {
    // Collect handlers: specific type + wildcard
    const handlers: EventHandler[] = []
    const specificHandlers = this.handlerRegistry.get(event.type)
    const wildcardHandlers = this.handlerRegistry.get('*')

    if (specificHandlers) handlers.push(...specificHandlers)
    if (wildcardHandlers) handlers.push(...wildcardHandlers)

    if (handlers.length === 0) {
      // No handlers registered — mark as processed
      await this.markEventProcessed(event.id, true)
      return
    }

    let anySuccess = false

    // Run all handlers concurrently with error isolation
    const results = await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event)
          return { handlerName: getHandlerName(handler), success: true }
        } catch (err) {
          return {
            handlerName: getHandlerName(handler),
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }),
    )

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        anySuccess = true
      } else if (result.status === 'fulfilled' && !result.value.success) {
        // Handler failed — add to DLQ (unless skipping, e.g. during replay)
        if (!_skipDLQ) {
          this.dlq.push({
            event,
            error: result.value.error ?? 'Unknown error',
            handlerName: result.value.handlerName ?? 'unknown',
            retryCount: 0,
            lastAttemptAt: new Date(),
            nextRetryAt: new Date(Date.now() + this.options.retryDelayMs),
          })
          logWarn('EVENT_BUS', 'handler_failed_dlq', {
            eventId: event.id,
            eventType: event.type,
            handlerName: result.value.handlerName,
            error: result.value.error,
          })
        }
      } else if (result.status === 'rejected') {
        if (!_skipDLQ) {
          this.dlq.push({
            event,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            handlerName: 'unknown',
            retryCount: 0,
            lastAttemptAt: new Date(),
            nextRetryAt: new Date(Date.now() + this.options.retryDelayMs),
          })
        }
      }
    }

    // Mark event as processed in DB
    await this.markEventProcessed(event.id, anySuccess)
  }

  /**
   * Persist an event to the EventLog table in Prisma.
   */
  private async persistEvent<T extends EventType>(
    event: EventEnvelope<T>,
    processed: boolean,
  ): Promise<void> {
    if (!this.options.persistToDb) return

    try {
      await db.eventLog.create({
        data: {
          id: event.id,
          type: event.type,
          source: event.source,
          payload: JSON.stringify(event.payload),
          processed,
        },
      })
    } catch (err) {
      logError('EVENT_BUS', 'persist_error', err, { eventType: event.type })
    }
  }

  /**
   * Mark an event as processed (or failed) in the DB.
   */
  private async markEventProcessed(
    eventId: string,
    success: boolean,
  ): Promise<void> {
    if (!this.options.persistToDb) return

    try {
      await db.eventLog.update({
        where: { id: eventId },
        data: {
          processed: success,
          ...(success ? {} : { error: 'Handler execution failed' }),
        },
      })
    } catch (err) {
      // If update fails (e.g., event wasn't persisted), log and continue
      logWarn('EVENT_BUS', 'mark_processed_error', {
        eventId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

let eventCounter = 0

/**
 * Generate a unique event ID.
 * In production, uses cuid-like format. For tests, uses a simple counter.
 */
function generateEventId(): string {
  eventCounter++
  const timestamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `evt_${timestamp}_${rand}_${eventCounter}`
}

/**
 * Try to extract a meaningful name from a handler function.
 */
function getHandlerName(handler: EventHandler): string {
  if (handler.name && handler.name !== 'wrapper' && handler.name !== 'anonymous') {
    return handler.name
  }
  return 'anonymous'
}

// ═══════════════════════════════════════════════════════════════
// Singleton Export
// ═══════════════════════════════════════════════════════════════

/**
 * Global singleton event bus instance.
 * Import this wherever you need to emit or subscribe to events.
 *
 * @example
 * ```ts
 * import { eventBus, EVENT_TYPES } from '@/lib/event-bus'
 *
 * // Emit
 * await eventBus.emit(EVENT_TYPES.MESSAGE_RECEIVED, {
 *   messageId: 'msg_123',
 *   conversationId: 'conv_456',
 *   channel: 'whatsapp',
 *   content: 'Hola!',
 * })
 *
 * // Subscribe
 * const unsub = eventBus.on(EVENT_TYPES.MESSAGE_RECEIVED, async (event) => {
 *   console.log('New message:', event.payload.content)
 * })
 *
 * // Unsubscribe
 * unsub()
 * ```
 */
export const eventBus = new EventBus()

// Export for testing / creating isolated instances
export { EventBus }
export default eventBus
