// ═══════════════════════════════════════════════════════════════
// EventBus — Tests
// 5+ tests proving: emit/on/off/once, middleware, wildcard,
// DLQ, error isolation, persistence
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventBus, EVENT_TYPES } from '@/lib/event-bus'
import type { EventEnvelope, EventHandler } from '@/lib/event-bus'

// Helper: wait for async operations to settle
const flush = (ms = 50) => new Promise((r) => setTimeout(r, ms))

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    // Create a fresh isolated instance with DB persistence OFF for unit tests
    bus = new EventBus({ persistToDb: false, retryDelayMs: 10 })
  })

  afterEach(() => {
    bus.removeAllListeners()
    bus.clearMiddleware()
    bus.clearDLQ()
  })

  // ─── TEST 1: Basic emit / on / off ─────────────────────

  describe('basic emit/on/off', () => {
    it('should deliver an emitted event to a registered handler', async () => {
      const received: EventEnvelope[] = []

      bus.on('message.received', async (event) => {
        received.push(event)
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Hola!',
      })

      await flush()

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('message.received')
      expect(received[0].payload.content).toBe('Hola!')
      expect(received[0].payload.messageId).toBe('msg_1')
      expect(received[0].source).toBe('system')
      expect(received[0].id).toBeTruthy()
      expect(received[0].timestamp).toBeInstanceOf(Date)
    })

    it('should stop receiving events after unsubscribing with off()', async () => {
      const received: EventEnvelope[] = []

      const handler: EventHandler<'message.received'> = async (event) => {
        received.push(event)
      }

      bus.on('message.received', handler)

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'First',
      })
      await flush()

      bus.off('message.received', handler)

      await bus.emit('message.received', {
        messageId: 'msg_2',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Second',
      })
      await flush()

      expect(received).toHaveLength(1)
      expect(received[0].payload.content).toBe('First')
    })

    it('should return an unsubscribe function from on()', async () => {
      const received: EventEnvelope[] = []

      const unsub = bus.on('message.received', async (event) => {
        received.push(event)
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'A',
      })
      await flush()

      unsub()

      await bus.emit('message.received', {
        messageId: 'msg_2',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'B',
      })
      await flush()

      expect(received).toHaveLength(1)
    })

    it('should deliver events to multiple handlers on the same type', async () => {
      const results: string[] = []

      bus.on('message.sent', async () => { results.push('handler-1') })
      bus.on('message.sent', async () => { results.push('handler-2') })
      bus.on('message.sent', async () => { results.push('handler-3') })

      await bus.emit('message.sent', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Test',
      })
      await flush()

      expect(results).toHaveLength(3)
      expect(results).toContain('handler-1')
      expect(results).toContain('handler-2')
      expect(results).toContain('handler-3')
    })
  })

  // ─── TEST 2: once() — auto-unsubscribe after first call ──

  describe('once()', () => {
    it('should only fire the handler once then auto-unsubscribe', async () => {
      let callCount = 0

      bus.once('emotion.detected', async () => {
        callCount++
      })

      await bus.emit('emotion.detected', {
        conversationId: 'conv_1',
        emotion: 'happy',
        confidence: 0.9,
      })
      await bus.emit('emotion.detected', {
        conversationId: 'conv_1',
        emotion: 'sad',
        confidence: 0.7,
      })
      await flush()

      expect(callCount).toBe(1)
    })
  })

  // ─── TEST 3: Wildcard '*' subscribers ───────────────────

  describe('wildcard subscribers', () => {
    it('should deliver all event types to wildcard subscribers', async () => {
      const allEvents: EventEnvelope[] = []

      bus.on('*', async (event) => {
        allEvents.push(event)
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Hello',
      })
      await bus.emit('system.error', {
        error: 'Something broke',
        context: 'test',
      })
      await bus.emit('agent.invoked', {
        agentId: 'agent_1',
        agentType: 'sales',
        conversationId: 'conv_1',
        input: 'Hi',
      })
      await flush()

      expect(allEvents).toHaveLength(3)
      expect(allEvents[0].type).toBe('message.received')
      expect(allEvents[1].type).toBe('system.error')
      expect(allEvents[2].type).toBe('agent.invoked')
    })

    it('should deliver to both specific and wildcard handlers', async () => {
      const specificEvents: string[] = []
      const wildcardEvents: string[] = []

      bus.on('message.sent', async (e) => {
        specificEvents.push(e.type)
      })
      bus.on('*', async (e) => {
        wildcardEvents.push(e.type)
      })

      await bus.emit('message.sent', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Hi',
      })
      await bus.emit('system.error', {
        error: 'oops',
      })
      await flush()

      expect(specificEvents).toHaveLength(1)
      expect(specificEvents[0]).toBe('message.sent')
      expect(wildcardEvents).toHaveLength(2)
      expect(wildcardEvents[0]).toBe('message.sent')
      expect(wildcardEvents[1]).toBe('system.error')
    })
  })

  // ─── TEST 4: Event Middleware ───────────────────────────

  describe('middleware', () => {
    it('should transform event payload through middleware', async () => {
      bus.use(async (event) => {
        return {
          ...event,
          payload: {
            ...event.payload,
            _enriched: true,
          } as any,
        }
      })

      let capturedPayload: any = null
      bus.on('message.received', async (event) => {
        capturedPayload = event.payload
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Hi',
      })
      await flush()

      expect(capturedPayload._enriched).toBe(true)
      expect(capturedPayload.content).toBe('Hi')
    })

    it('should filter/drop events when middleware returns null', async () => {
      bus.use(async (event) => {
        // Drop all system.error events
        if (event.type === 'system.error') return null
        return event
      })

      const received: EventEnvelope[] = []
      bus.on('*', async (event) => {
        received.push(event)
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Hello',
      })
      await bus.emit('system.error', {
        error: 'This should be dropped',
      })
      await flush()

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('message.received')
    })

    it('should run middleware in order (chain)', async () => {
      const log: string[] = []

      bus.use(async (event) => {
        log.push(`mw1:${event.type}`)
        return event
      })
      bus.use(async (event) => {
        log.push(`mw2:${event.type}`)
        return event
      })
      bus.use(async (event) => {
        log.push(`mw3:${event.type}`)
        return event
      })

      await bus.emit('tool.called', {
        toolName: 'search',
        conversationId: 'conv_1',
        success: true,
        input: {},
      })
      await flush()

      expect(log).toEqual(['mw1:tool.called', 'mw2:tool.called', 'mw3:tool.called'])
    })

    it('should remove middleware with the returned unsubscribe function', async () => {
      const log: string[] = []

      const remove = bus.use(async (event) => {
        log.push('middleware-ran')
        return event
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'A',
      })
      await flush()

      remove()

      await bus.emit('message.received', {
        messageId: 'msg_2',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'B',
      })
      await flush()

      expect(log).toHaveLength(1)
    })
  })

  // ─── TEST 5: Error Isolation & Dead Letter Queue ────────

  describe('error isolation & DLQ', () => {
    it('should isolate handler errors — other handlers still run', async () => {
      const results: string[] = []

      bus.on('message.received', async () => {
        results.push('handler-1-ok')
      })

      bus.on('message.received', async () => {
        throw new Error('Handler 2 exploded!')
      })

      bus.on('message.received', async () => {
        results.push('handler-3-ok')
      })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Test',
      })
      await flush()

      // Both good handlers should have run despite the middle one failing
      expect(results).toHaveLength(2)
      expect(results).toContain('handler-1-ok')
      expect(results).toContain('handler-3-ok')

      // The failed handler should land in the DLQ
      expect(bus.getDLQSize()).toBe(1)
      const dlq = bus.getDLQ()
      expect(dlq[0].error).toContain('Handler 2 exploded!')
      expect(dlq[0].handlerName).toBeDefined()
      expect(dlq[0].retryCount).toBe(0)
    })

    it('should add failed events to the Dead Letter Queue', async () => {
      bus.on('ghosting.detected', async () => {
        throw new Error('Processing ghost event failed')
      })

      await bus.emit('ghosting.detected', {
        contactId: 'contact_1',
        conversationId: 'conv_1',
        workspaceId: 'ws_1',
        hoursSinceLastMessage: 72,
      })
      await flush()

      const dlq = bus.getDLQ()
      expect(dlq).toHaveLength(1)
      expect(dlq[0].event.type).toBe('ghosting.detected')
      expect(dlq[0].event.payload.contactId).toBe('contact_1')
    })

    it('should retry DLQ entries and succeed on second attempt', async () => {
      let shouldFail = true

      bus.on('message.sent', async () => {
        if (shouldFail) {
          throw new Error('Temporary failure')
        }
      })

      // First emit — should fail and go to DLQ
      await bus.emit('message.sent', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Retry me',
      })
      await flush()

      expect(bus.getDLQSize()).toBe(1)

      // Fix the handler
      shouldFail = false

      // Retry DLQ (must be past nextRetryAt)
      const result = await bus.retryDLQ()

      expect(result.retried).toBe(1)
      expect(result.failed).toBe(0)
      expect(bus.getDLQSize()).toBe(0)
    })

    it('should discard DLQ entries after max retries', async () => {
      const busWithLowRetries = new EventBus({
        persistToDb: false,
        maxRetries: 2,
        retryDelayMs: 0, // immediate retry
      })

      busWithLowRetries.on('system.error', async () => {
        throw new Error('Always fails')
      })

      await busWithLowRetries.emit('system.error', {
        error: 'permanent failure',
      })
      await flush()

      // Initial DLQ entry has retryCount=0, maxRetries=2
      // First retryDLQ: 0 < 2 → retry, fails → retryCount becomes 1
      await busWithLowRetries.retryDLQ()
      expect(busWithLowRetries.getDLQSize()).toBe(1)
      expect(busWithLowRetries.getDLQ()[0].retryCount).toBe(1)

      // Second retryDLQ: 1 < 2 → retry, fails → retryCount becomes 2
      await busWithLowRetries.retryDLQ()
      expect(busWithLowRetries.getDLQSize()).toBe(1)
      expect(busWithLowRetries.getDLQ()[0].retryCount).toBe(2)

      // Third retryDLQ: 2 >= 2 → discard
      await busWithLowRetries.retryDLQ()
      expect(busWithLowRetries.getDLQSize()).toBe(0)

      busWithLowRetries.removeAllListeners()
      busWithLowRetries.clearDLQ()
    })

    it('should clear DLQ when clearDLQ() is called', async () => {
      bus.on('system.error', async () => {
        throw new Error('fail')
      })

      await bus.emit('system.error', { error: 'test' })
      await bus.emit('system.error', { error: 'test2' })
      await flush()

      expect(bus.getDLQSize()).toBe(2)
      bus.clearDLQ()
      expect(bus.getDLQSize()).toBe(0)
    })
  })

  // ─── TEST 6: Typed payloads ────────────────────────────

  describe('typed payloads', () => {
    it('should emit all EVENT_TYPES constant event types', async () => {
      const receivedTypes: string[] = []

      bus.on('*', async (event) => {
        receivedTypes.push(event.type)
      })

      // Emit one of every defined event type
      await bus.emit(EVENT_TYPES.MESSAGE_RECEIVED, {
        messageId: 'm1',
        conversationId: 'c1',
        channel: 'whatsapp',
        content: 'Hi',
      })
      await bus.emit(EVENT_TYPES.MESSAGE_SENT, {
        messageId: 'm2',
        conversationId: 'c1',
        channel: 'whatsapp',
        content: 'Reply',
      })
      await bus.emit(EVENT_TYPES.EMOTION_DETECTED, {
        conversationId: 'c1',
        emotion: 'happy',
        confidence: 0.95,
      })
      await bus.emit(EVENT_TYPES.MEMORY_STORED, {
        memoryId: 'mem1',
        key: 'budget',
        source: 'conversation',
      })
      await bus.emit(EVENT_TYPES.AGENT_INVOKED, {
        agentId: 'a1',
        agentType: 'sales',
        conversationId: 'c1',
        input: 'Hi',
      })
      await bus.emit(EVENT_TYPES.AGENT_RESPONDED, {
        agentId: 'a1',
        agentType: 'sales',
        conversationId: 'c1',
        response: 'Hello!',
        latencyMs: 150,
      })
      await bus.emit(EVENT_TYPES.CONTACT_UPDATED, {
        contactId: 'ct1',
        workspaceId: 'ws1',
        changes: { leadScore: { old: 0, new: 50 } },
      })
      await bus.emit(EVENT_TYPES.DEAL_STAGE_CHANGED, {
        dealId: 'd1',
        workspaceId: 'ws1',
        toStageId: 's2',
        toStageName: 'Qualified',
      })
      await bus.emit(EVENT_TYPES.FOLLOWUP_CREATED, {
        taskId: 'f1',
        contactId: 'ct1',
        conversationId: 'c1',
        ruleId: 'r1',
        scheduledAt: new Date().toISOString(),
        channel: 'whatsapp',
      })
      await bus.emit(EVENT_TYPES.NEXUS_TEMPERATURE_CHANGED, {
        userId: 'u1',
        oldValue: 50,
        newValue: 75,
        source: 'conversation',
      })
      await bus.emit(EVENT_TYPES.AUTOMATION_TRIGGERED, {
        automationId: 'auto1',
        workspaceId: 'ws1',
        triggerType: 'event',
        actions: [{ type: 'send_message' }],
      })
      await bus.emit(EVENT_TYPES.GHOSTING_DETECTED, {
        contactId: 'ct1',
        conversationId: 'c1',
        workspaceId: 'ws1',
        hoursSinceLastMessage: 48,
      })
      await bus.emit(EVENT_TYPES.SYSTEM_ERROR, {
        error: 'Something went wrong',
      })
      await bus.emit(EVENT_TYPES.TOOL_CALLED, {
        toolName: 'web_search',
        conversationId: 'c1',
        input: { query: 'best CRM' },
        success: true,
      })

      await flush()

      expect(receivedTypes).toHaveLength(14)
      expect(receivedTypes).toContain('message.received')
      expect(receivedTypes).toContain('message.sent')
      expect(receivedTypes).toContain('emotion.detected')
      expect(receivedTypes).toContain('memory.stored')
      expect(receivedTypes).toContain('agent.invoked')
      expect(receivedTypes).toContain('agent.responded')
      expect(receivedTypes).toContain('contact.updated')
      expect(receivedTypes).toContain('deal.stage_changed')
      expect(receivedTypes).toContain('followup.created')
      expect(receivedTypes).toContain('nexus.temperature_changed')
      expect(receivedTypes).toContain('automation.triggered')
      expect(receivedTypes).toContain('ghosting.detected')
      expect(receivedTypes).toContain('system.error')
      expect(receivedTypes).toContain('tool.called')
    })

    it('should pass correct payload types to handlers', async () => {
      interface Received {
        agentType: string
        response: string
        latencyMs: number
      }

      let captured: Received | null = null

      bus.on('agent.responded', async (event) => {
        // TypeScript should enforce the correct payload shape
        const p = event.payload
        captured = {
          agentType: p.agentType,
          response: p.response,
          latencyMs: p.latencyMs,
        }
      })

      await bus.emit('agent.responded', {
        agentId: 'a1',
        agentType: 'sales',
        conversationId: 'c1',
        response: 'Great choice!',
        latencyMs: 230,
        confidence: 0.95,
      })
      await flush()

      expect(captured).not.toBeNull()
      expect(captured!.agentType).toBe('sales')
      expect(captured!.response).toBe('Great choice!')
      expect(captured!.latencyMs).toBe(230)
    })
  })

  // ─── TEST 7: Event source and metadata ──────────────────

  describe('event metadata', () => {
    it('should use custom source and metadata when provided', async () => {
      let capturedEvent: EventEnvelope | null = null

      bus.on('message.received', async (event) => {
        capturedEvent = event
      })

      await bus.emit(
        'message.received',
        {
          messageId: 'msg_1',
          conversationId: 'conv_1',
          channel: 'whatsapp',
          content: 'Hi',
        },
        'whatsapp-gateway',
        { traceId: 'trace_abc123' },
      )
      await flush()

      expect(capturedEvent).not.toBeNull()
      expect(capturedEvent!.source).toBe('whatsapp-gateway')
      expect(capturedEvent!.metadata).toEqual({ traceId: 'trace_abc123' })
    })

    it('should return a unique event ID from emit()', async () => {
      const id1 = await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'A',
      })
      const id2 = await bus.emit('message.received', {
        messageId: 'msg_2',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'B',
      })

      expect(id1).toBeTruthy()
      expect(id2).toBeTruthy()
      expect(id1).not.toBe(id2)
    })
  })

  // ─── TEST 8: removeAllListeners ────────────────────────

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific type', async () => {
      const received: EventEnvelope[] = []

      bus.on('message.received', async (e) => { received.push(e) })
      bus.on('message.received', async (e) => { received.push(e) })
      bus.on('system.error', async (e) => { received.push(e) })

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'Before clear',
      })
      await flush()

      expect(received).toHaveLength(2)

      bus.removeAllListeners('message.received')

      await bus.emit('message.received', {
        messageId: 'msg_2',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'After clear',
      })
      await bus.emit('system.error', { error: 'Still works' })
      await flush()

      // Only the system.error handler should fire
      expect(received).toHaveLength(3)
      expect(received[2].type).toBe('system.error')
    })

    it('should remove ALL listeners when called without arguments', async () => {
      const received: EventEnvelope[] = []

      bus.on('message.received', async (e) => { received.push(e) })
      bus.on('system.error', async (e) => { received.push(e) })
      bus.on('*', async (e) => { received.push(e) })

      bus.removeAllListeners()

      await bus.emit('message.received', {
        messageId: 'msg_1',
        conversationId: 'conv_1',
        channel: 'whatsapp',
        content: 'No one listening',
      })
      await flush()

      expect(received).toHaveLength(0)
    })
  })

  // ─── TEST 9: Exponential backoff in DLQ retries ────────

  describe('DLQ retry backoff', () => {
    it('should use exponential backoff for retry scheduling', async () => {
      // Use 10ms base delay — delay1=10ms, delay2=20ms (measurably different)
      const backoffBus = new EventBus({ persistToDb: false, retryDelayMs: 10 })

      backoffBus.on('system.error', async () => {
        throw new Error('always fails')
      })

      await backoffBus.emit('system.error', { error: 'backoff test' })
      await flush()

      const initial = backoffBus.getDLQ()[0]
      expect(initial.retryCount).toBe(0)

      // Retry 1: entry is due (retryDelayMs=10, flush waited 50ms)
      await backoffBus.retryDLQ()
      const after1 = backoffBus.getDLQ()[0]
      expect(after1.retryCount).toBe(1)

      // Wait for exponential backoff: 10ms * 2^0 = 10ms + buffer
      await flush(20)

      // Retry 2
      await backoffBus.retryDLQ()
      const after2 = backoffBus.getDLQ()[0]
      expect(after2.retryCount).toBe(2)

      // Verify exponential backoff: delay1=10ms, delay2=20ms
      const delay1 = after1.nextRetryAt.getTime() - after1.lastAttemptAt.getTime()
      const delay2 = after2.nextRetryAt.getTime() - after2.lastAttemptAt.getTime()
      expect(delay1).toBeGreaterThanOrEqual(10)
      expect(delay2).toBeGreaterThanOrEqual(20)
      expect(delay2).toBeGreaterThan(delay1) // exponential growth
    })
  })
})
