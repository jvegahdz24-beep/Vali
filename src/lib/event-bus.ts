// ValiAutoFlow — typed in-process event bus
// The singleton is used by application code. EventBus is exported for isolated tests/jobs.
// Persistence is intentionally not implicit: callers must add an explicit durable worker if
// an event must survive a process restart. This avoids silently claiming DB durability.

import { randomUUID } from 'node:crypto'

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
  NEXUS_PATTERN_DETECTED: 'nexus.pattern_detected',
  NEXUS_FOLLOWUP_GENERATED: 'nexus.followup_generated',
  NEXUS_SILENCE_DETECTED: 'nexus.silence_detected',
  AUTOMATION_TRIGGERED: 'automation.triggered',
  GHOSTING_DETECTED: 'ghosting.detected',
  SYSTEM_ERROR: 'system.error',
  TOOL_CALLED: 'tool.called',
} as const

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES] | string

type MessagePayload = {
  messageId?: string
  conversationId: string
  workspaceId?: string
  contactId?: string | null
  channel: string
  content: string
  [key: string]: unknown
}

type EventPayloadMap = {
  'message.received': MessagePayload
  'message.sent': MessagePayload
  'emotion.detected': {
    conversationId: string
    emotion: string
    confidence: number
    [key: string]: unknown
  }
  'memory.stored': {
    memoryId: string
    key: string
    source: string
    [key: string]: unknown
  }
  'agent.invoked': {
    agentId: string
    agentType: string
    conversationId?: string
    input: string
    [key: string]: unknown
  }
  'agent.responded': {
    agentId: string
    agentType: string
    conversationId?: string
    response: string
    latencyMs: number
    [key: string]: unknown
  }
  'contact.updated': {
    contactId: string
    workspaceId: string
    changes: Record<string, unknown>
    [key: string]: unknown
  }
  'deal.stage_changed': {
    dealId: string
    workspaceId: string
    contactId?: string | null
    toStageId?: string
    toStageName?: string
    [key: string]: unknown
  }
  'followup.created': {
    taskId: string
    contactId: string
    conversationId?: string
    ruleId?: string
    scheduledAt: string
    channel: string
    [key: string]: unknown
  }
  'nexus.temperature_changed': {
    userId: string
    oldValue: number
    newValue: number
    source: string
    [key: string]: unknown
  }
  'nexus.energy_changed': Record<string, unknown>
  'nexus.pattern_detected': Record<string, unknown>
  'nexus.followup_generated': Record<string, unknown>
  'nexus.silence_detected': Record<string, unknown>
  'automation.triggered': {
    automationId: string
    workspaceId: string
    triggerType: string
    actions: unknown[]
    [key: string]: unknown
  }
  'ghosting.detected': {
    contactId: string
    conversationId?: string
    workspaceId: string
    hoursSinceLastMessage: number
    lastStage?: string
    [key: string]: unknown
  }
  'system.error': {
    error: string
    context?: string
    [key: string]: unknown
  }
  'tool.called': {
    toolName: string
    conversationId?: string
    input: Record<string, unknown>
    success: boolean
    [key: string]: unknown
  }
}

export type EventMap = EventPayloadMap

type PayloadFor<T extends string> = T extends keyof EventPayloadMap
  ? EventPayloadMap[T]
  : Record<string, unknown>

export interface EventEnvelope<T extends string = string> {
  id: string
  type: T
  payload: PayloadFor<T>
  source: string
  timestamp: Date
  metadata: Record<string, unknown>
}

export type EventHandler<T extends string = string> = (
  event: EventEnvelope<T>,
) => void | Promise<void>

export type EventMiddleware = (
  event: EventEnvelope,
) => EventEnvelope | null | Promise<EventEnvelope | null>

export interface DeadLetterEntry {
  event: EventEnvelope
  error: string
  handlerName: string
  retryCount: number
  lastAttemptAt: Date
  nextRetryAt: Date
  handler: EventHandler
}

export interface EventBusOptions {
  /** Kept for API compatibility; durable persistence is not implicit in this process-local bus. */
  persistToDb?: boolean
  maxRetries?: number
  retryDelayMs?: number
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class EventBus {
  private readonly listeners = new Map<string, Set<EventHandler>>()
  private readonly middlewares = new Set<EventMiddleware>()
  private readonly dlq: DeadLetterEntry[] = []
  private readonly maxRetries: number
  private readonly retryDelayMs: number

  constructor(options: EventBusOptions = {}) {
    this.maxRetries = Math.max(0, options.maxRetries ?? 3)
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 5_000)
  }

  on<T extends string>(type: T, handler: EventHandler<T>): () => void {
    const handlers = this.listeners.get(type) ?? new Set<EventHandler>()
    handlers.add(handler as EventHandler)
    this.listeners.set(type, handlers)
    return () => this.off(type, handler)
  }

  off<T extends string>(type: T, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(type)
    if (!handlers) return
    handlers.delete(handler as EventHandler)
    if (handlers.size === 0) this.listeners.delete(type)
  }

  once<T extends string>(type: T, handler: EventHandler<T>): () => void {
    let unsubscribe: (() => void) | undefined
    const wrapped: EventHandler<T> = async (event) => {
      unsubscribe?.()
      await handler(event)
    }
    unsubscribe = this.on(type, wrapped)
    return unsubscribe
  }

  use(middleware: EventMiddleware): () => void {
    this.middlewares.add(middleware)
    return () => this.middlewares.delete(middleware)
  }

  async emit<T extends string>(
    type: T,
    payload: PayloadFor<T>,
    source = 'system',
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const id = randomUUID()
    let event: EventEnvelope<T> = {
      id,
      type,
      payload,
      source,
      timestamp: new Date(),
      metadata,
    }

    for (const middleware of this.middlewares) {
      const transformed = await middleware(event)
      if (!transformed) return id
      event = transformed as EventEnvelope<T>
    }

    const handlers = [
      ...(this.listeners.get(type) ?? []),
      ...(type === '*' ? [] : this.listeners.get('*') ?? []),
    ]

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event as EventEnvelope)
        } catch (error) {
          this.addToDLQ(event as EventEnvelope, handler, error)
        }
      }),
    )

    return id
  }

  private addToDLQ(event: EventEnvelope, handler: EventHandler, error: unknown): void {
    const now = new Date()
    this.dlq.push({
      event,
      handler,
      handlerName: handler.name || 'anonymous',
      error: error instanceof Error ? error.message : String(error),
      retryCount: 0,
      lastAttemptAt: now,
      nextRetryAt: new Date(now.getTime() + this.retryDelayMs),
    })
  }

  async retryDLQ(): Promise<{ retried: number; failed: number }> {
    const now = Date.now()
    let retried = 0
    let failed = 0

    for (let index = this.dlq.length - 1; index >= 0; index -= 1) {
      const entry = this.dlq[index]
      if (!entry || entry.nextRetryAt.getTime() > now) continue

      if (entry.retryCount >= this.maxRetries) {
        this.dlq.splice(index, 1)
        continue
      }

      try {
        await entry.handler(entry.event)
        this.dlq.splice(index, 1)
        retried += 1
      } catch (error) {
        entry.retryCount += 1
        entry.lastAttemptAt = new Date()
        entry.nextRetryAt = new Date(
          entry.lastAttemptAt.getTime() + this.retryDelayMs * Math.pow(2, entry.retryCount - 1),
        )
        entry.error = error instanceof Error ? error.message : String(error)
        failed += 1
      }
    }

    return { retried, failed }
  }

  getDLQ(): DeadLetterEntry[] {
    return this.dlq.map((entry) => ({ ...entry }))
  }

  getDLQSize(): number {
    return this.dlq.length
  }

  clearDLQ(): void {
    this.dlq.length = 0
  }

  removeAllListeners(type?: string): void {
    if (type) this.listeners.delete(type)
    else this.listeners.clear()
  }

  clearMiddleware(): void {
    this.middlewares.clear()
  }
}

export const eventBus = new EventBus({ persistToDb: false })

export function publish<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
  void eventBus.emit(event, payload as PayloadFor<K>)
}

export function subscribe<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void | Promise<void>,
): () => void {
  return eventBus.on(event, async (envelope) => handler(envelope.payload as EventMap[K]))
}

export function subscribeOnce<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void | Promise<void>,
): () => void {
  return eventBus.once(event, async (envelope) => handler(envelope.payload as EventMap[K]))
}

export { delay }
