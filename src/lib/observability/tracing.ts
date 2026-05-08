// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — OpenTelemetry Tracing
// Distributed tracing with correlation IDs
// Graceful degradation: if tracing fails, it is a no-op
// ═══════════════════════════════════════════════════════════════

import { logWarn } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────

export type SpanStatus = 'ok' | 'error' | 'unset'

export interface SpanAttributes {
  [key: string]: string | number | boolean | null | undefined
}

export interface CompletedSpan {
  id: string
  traceId: string
  parentId: string | null
  name: string
  startTime: string       // ISO 8601
  endTime: string         // ISO 8601
  durationMs: number
  attributes: SpanAttributes
  status: SpanStatus
}

export interface ActiveSpan {
  id: string
  traceId: string
  parentId: string | null
  name: string
  startTime: number       // performance.now()
  attributes: SpanAttributes
  /** End the span, recording it to the buffer. */
  end: (status?: SpanStatus, extraAttrs?: SpanAttributes) => CompletedSpan
}

export interface TraceSnapshot {
  traceId: string
  rootSpanName: string
  spanCount: number
  totalDurationMs: number
  spans: CompletedSpan[]
}

// ─── Circular Buffer ──────────────────────────────────────────

const MAX_BUFFER_SIZE = 1000

class CircularSpanBuffer {
  private buffer: CompletedSpan[] = []
  private head = 0
  private count = 0

  push(span: CompletedSpan): void {
    if (this.count < MAX_BUFFER_SIZE) {
      // Buffer not full yet — append
      this.buffer.push(span)
      this.count++
    } else {
      // Buffer full — overwrite oldest (circular)
      this.buffer[this.head] = span
      this.head = (this.head + 1) % MAX_BUFFER_SIZE
    }
  }

  /** Return all spans in insertion order (oldest → newest). */
  all(): CompletedSpan[] {
    if (this.count < MAX_BUFFER_SIZE) {
      return [...this.buffer]
    }
    // Circular buffer: items from head..end then 0..head
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)]
  }

  size(): number {
    return this.count
  }

  clear(): void {
    this.buffer = []
    this.head = 0
    this.count = 0
  }
}

const spanBuffer = new CircularSpanBuffer()

// ─── ID Generation ────────────────────────────────────────────

/**
 * Generate a trace ID: `tr_` + 24 random hex chars.
 */
export function generateTraceId(): string {
  return 'tr_' + randomHex(24)
}

/**
 * Generate a span ID: 16 random hex chars.
 */
export function generateSpanId(): string {
  return randomHex(16)
}

function randomHex(bytes: number): string {
  const chars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < bytes; i++) {
    result += chars[Math.floor(Math.random() * 16)]
  }
  return result
}

// ─── Async Context (simple, no external deps) ─────────────────
// We use a module-level variable for the current trace/span context.
// In serverless / edge environments this is per-request automatically.

let _currentTraceId: string | null = null
let _currentParentId: string | null = null

export function getActiveTraceId(): string | null {
  return _currentTraceId
}

export function getActiveParentId(): string | null {
  return _currentParentId
}

/**
 * Run a callback within a given trace context.
 * This is a lightweight replacement for AsyncLocalStorage when not available.
 */
export function withTraceContext<T>(
  traceId: string,
  parentId: string | null,
  fn: () => T
): T {
  const prevTraceId = _currentTraceId
  const prevParentId = _currentParentId
  _currentTraceId = traceId
  _currentParentId = parentId
  try {
    return fn()
  } finally {
    _currentTraceId = prevTraceId
    _currentParentId = prevParentId
  }
}

// ─── Start Span ───────────────────────────────────────────────

/**
 * Start a new span. If no traceId or parentId is provided, they are
 * inherited from the current async context, or a new trace is created.
 */
export function startSpan(
  name: string,
  attrs?: SpanAttributes,
  options?: { traceId?: string; parentId?: string | null }
): ActiveSpan {
  const traceId = options?.traceId
    || _currentTraceId
    || generateTraceId()
  const parentId = options?.parentId
    || _currentParentId
    || null
  const id = generateSpanId()

  const mergedAttrs: SpanAttributes = {
    ...(attrs || {}),
  }

  const startTime = performance.now()

  let ended = false

  const activeSpan: ActiveSpan = {
    id,
    traceId,
    parentId,
    name,
    startTime,
    attributes: mergedAttrs,
    end: (status: SpanStatus = 'ok', extraAttrs?: SpanAttributes): CompletedSpan => {
      if (ended) {
        // Double-end protection: return a zero-duration stub
        return {
          id,
          traceId,
          parentId,
          name,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: 0,
          attributes: mergedAttrs,
          status,
        }
      }
      ended = true

      const endTime = performance.now()
      const durationMs = Math.round((endTime - startTime) * 100) / 100

      const completed: CompletedSpan = {
        id,
        traceId,
        parentId,
        name,
        startTime: new Date(startTime > 0 ? Date.now() - durationMs : Date.now()).toISOString(),
        endTime: new Date().toISOString(),
        durationMs,
        attributes: { ...mergedAttrs, ...extraAttrs },
        status,
      }

      try {
        spanBuffer.push(completed)
      } catch (err) {
        // Graceful degradation — never crash the app
        logWarn('CORE', 'span_buffer_push_failed', { error: String(err) })
      }

      return completed
    },
  }

  return activeSpan
}

// ─── Query Functions ──────────────────────────────────────────

/**
 * Retrieve all spans for a given trace ID.
 * Returns them sorted by startTime ascending.
 */
export function getTrace(traceId: string): CompletedSpan[] {
  const all = spanBuffer.all()
  const matching = all.filter((s) => s.traceId === traceId)
  matching.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return matching
}

/**
 * Get the most recent unique traces with their root span info.
 * Useful for /debug and dev tooling.
 */
export function getRecentTraces(limit: number = 20): TraceSnapshot[] {
  const all = spanBuffer.all()

  // Group by traceId, keep only the most recent
  const traceMap = new Map<string, CompletedSpan[]>()
  all.forEach((span) => {
    const existing = traceMap.get(span.traceId)
    if (existing) {
      existing.push(span)
    } else {
      traceMap.set(span.traceId, [span])
    }
  })

  const snapshots: TraceSnapshot[] = []
  Array.from(traceMap.entries()).forEach(([traceId, spans]) => {
    spans.sort((a, b) => a.startTime.localeCompare(b.startTime))
    const root = spans.find((s) => s.parentId === null) || spans[0]
    const last = spans[spans.length - 1]

    snapshots.push({
      traceId,
      rootSpanName: root.name,
      spanCount: spans.length,
      totalDurationMs: last ? Math.round(last.durationMs) : 0,
      spans,
    })
  })

  // Sort by most recent (use last span's endTime)
  snapshots.sort((a, b) => {
    const aEnd = a.spans[a.spans.length - 1]?.endTime || ''
    const bEnd = b.spans[b.spans.length - 1]?.endTime || ''
    return bEnd.localeCompare(aEnd)
  })

  return snapshots.slice(0, limit)
}

/**
 * Get buffer statistics.
 */
export function getTraceStats(): { bufferSize: number; maxBufferSize: number } {
  return {
    bufferSize: spanBuffer.size(),
    maxBufferSize: MAX_BUFFER_SIZE,
  }
}

/**
 * Clear all stored spans. Useful in tests.
 */
export function clearTraces(): void {
  spanBuffer.clear()
}

// ─── Middleware Helper ─────────────────────────────────────────

/**
 * Wrap an async request handler with automatic tracing.
 * Creates a root span for the request, sets trace context,
 * and records duration + HTTP attributes.
 *
 * Usage:
 *   export const GET = (req: NextRequest) =>
 *     traceMiddleware(req, async (span) => {
 *       // ... handler logic
 *       return Response.json({ ok: true })
 *     })
 */
export async function traceMiddleware<T extends Response>(
  req: Request,
  handler: (span: ActiveSpan) => Promise<T>
): Promise<T> {
  const method = req.method
  const url = new URL(req.url)
  const path = url.pathname

  const traceId = req.headers.get('x-trace-id') || generateTraceId()

  const span = startSpan(
    `${method} ${path}`,
    { 'http.method': method, 'http.url': req.url, 'http.target': path },
    { traceId, parentId: null }
  )

  try {
    return await withTraceContext(traceId, span.id, () => handler(span))
  } catch (err) {
    span.end('error', {
      'error.message': err instanceof Error ? err.message : String(err),
      'error.type': err instanceof Error ? err.constructor.name : 'UnknownError',
    })
    throw err
  }
}
