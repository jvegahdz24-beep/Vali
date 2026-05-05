// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Centralized Structured Logger
// Every log is a JSON object with tag, step, status, meta
// Tags: [AUTH] [CORE] [AI] [WHATSAPP] [DB] [ERROR] [MIDDLEWARE] [FLOW]
// ═══════════════════════════════════════════════════════════════

/** Debug logger — only outputs when DEBUG env var is set */
export const debug = process.env.DEBUG === 'true'
  ? (...args: unknown[]) => console.log('[DEBUG]', ...args)
  : () => {}

export type LogTag =
  | 'AUTH'
  | 'CORE'
  | 'AI'
  | 'WHATSAPP'
  | 'DB'
  | 'ERROR'
  | 'MIDDLEWARE'
  | 'FLOW'
  | 'SYSTEM'
  | 'FRONTEND'
  | 'FOLLOWUP'
  | 'STAGE_TRACKER'
  | 'EVENT_BUS'
  | 'LIFE_ENGINE'
  | 'HEALTH'
  | 'REDIS'
  | 'QUEUE'
  | 'METRICS'
  | 'TRACING'
  | 'OBSERVABILITY'

export interface LogEntry {
  tag: string       // e.g. "[CORE]"
  step: string      // e.g. "processMessageCore"
  status: 'ok' | 'error' | 'warn' | 'info'
  meta: Record<string, unknown>
  timestamp?: string
  latencyMs?: number
}

// Track last error for /api/debug/system
let _lastError: { message: string; tag: string; step: string; timestamp: string } | null = null

export function getLastError() {
  return _lastError
}

// ─── Core Logger ─────────────────────────────────────────────

function formatEntry(entry: LogEntry): string {
  const ts = entry.timestamp || new Date().toISOString()
  const obj: Record<string, unknown> = {
    tag: entry.tag,
    step: entry.step,
    status: entry.status,
    ...entry.meta,
  }
  if (entry.latencyMs !== undefined) obj.latencyMs = entry.latencyMs
  return JSON.stringify(obj)
}

/**
 * Log an info message.
 */
export function logInfo(tag: string, step: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = { tag: `[${tag}]`, step, status: 'info', meta }
  console.log(formatEntry(entry))
}

/**
 * Log a successful operation.
 */
export function logOk(tag: string, step: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = { tag: `[${tag}]`, step, status: 'ok', meta }
  console.log(formatEntry(entry))
}

/**
 * Log a warning (non-fatal).
 */
export function logWarn(tag: string, step: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = { tag: `[${tag}]`, step, status: 'warn', meta }
  console.warn(formatEntry(entry))
}

/**
 * Log an error (fatal or important).
 * Also stores it as the last error for the debug endpoint.
 */
export function logError(tag: string, step: string, error: unknown, meta: Record<string, unknown> = {}) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  _lastError = {
    message: message.slice(0, 500),
    tag,
    step,
    timestamp: new Date().toISOString(),
  }

  const entry: LogEntry = {
    tag: `[${tag}]`,
    step,
    status: 'error',
    meta: { message, ...meta, ...(stack ? { stack: stack.slice(0, 300) } : {}) },
  }
  console.error(formatEntry(entry))
}

/**
 * Create a step timer for measuring latency.
 */
export function logTimer(tag: string, step: string) {
  const start = Date.now()
  return {
    /**
     * End the timer and log with status.
     */
    end(status: 'ok' | 'error' | 'warn' | 'info', meta: Record<string, unknown> = {}) {
      const latencyMs = Date.now() - start
      const entry: LogEntry = { tag: `[${tag}]`, step, status, meta, latencyMs }
      const method = status === 'error' ? console.error : status === 'warn' ? console.warn : console.log
      method(formatEntry(entry))
      return latencyMs
    },
    /** Get elapsed ms without logging */
    elapsed() {
      return Date.now() - start
    },
  }
}

/**
 * Safe JSON.parse that never throws.
 * Returns fallback on error and logs a warning.
 */
export function safeJsonParse(text: string, fallback: unknown = []): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/**
 * Safe access to nested object properties.
 * Returns fallback if any part of the chain is null/undefined.
 */
export function safeGet<T>(obj: unknown, path: string, fallback: T): T {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null) return fallback
    current = (current as Record<string, unknown>)[key]
  }
  return (current as T) ?? fallback
}
