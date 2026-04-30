// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Centralized Structured Logger
// Pino-based structured logger with PII redaction
// Every log is a JSON object with tag, step, status, meta
// Tags: [AUTH] [CORE] [AI] [WHATSAPP] [DB] [ERROR] [MIDDLEWARE] [FLOW]
// ═══════════════════════════════════════════════════════════════

import pino from 'pino'

// ─── Pino Logger Instance ────────────────────────────────────
// We use 'any' for the log methods to allow flexible calling patterns
// like log.info('string:', variable) without TypeScript overload errors.

const _pino = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', ignore: 'pid,hostname' }
    }
  } : {}),
  redact: {
    // FIX MEDIUM: Use deep wildcard paths for comprehensive PII redaction
    paths: ['phone', 'email', '*.phone', '*.email', '**.phone', '**.email', 'req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Wrap to allow log.info('msg:', data) without TypeScript overload errors
const logger: {
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
  debug: (...args: any[]) => void
  fatal: (...args: any[]) => void
  child: (bindings: Record<string, any>) => typeof logger
} = {
  info: (...args: any[]) => {
    if (typeof args[0] === 'string' && args.length > 1) {
      // Merge string message with data: log.info('msg:', data) → { msg: data, message: 'msg:' }
      const merged: Record<string, any> = {}
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
        Object.assign(merged, args[1])
      }
      merged.message = args[0]
      _pino.info(merged)
    } else {
      ;(_pino.info as any)(...args)
    }
  },
  warn: (...args: any[]) => {
    if (typeof args[0] === 'string' && args.length > 1) {
      const merged: Record<string, any> = {}
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
        Object.assign(merged, args[1])
      }
      merged.message = args[0]
      _pino.warn(merged)
    } else {
      ;(_pino.warn as any)(...args)
    }
  },
  error: (...args: any[]) => {
    if (typeof args[0] === 'string' && args.length > 1) {
      const merged: Record<string, any> = {}
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
        Object.assign(merged, args[1])
      }
      merged.message = args[0]
      _pino.error(merged)
    } else {
      ;(_pino.error as any)(...args)
    }
  },
  debug: (...args: any[]) => (_pino.debug as any)(...args),
  fatal: (...args: any[]) => (_pino.fatal as any)(...args),
  child: (bindings: Record<string, any>) => {
    const childLogger = _pino.child(bindings)
    return {
      info: (...args: any[]) => {
        if (typeof args[0] === 'string' && args.length > 1) {
          const merged: Record<string, any> = {}
          if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
            Object.assign(merged, args[1])
          }
          merged.message = args[0]
          childLogger.info(merged)
        } else {
          ;(childLogger.info as any)(...args)
        }
      },
      warn: (...args: any[]) => {
        if (typeof args[0] === 'string' && args.length > 1) {
          const merged: Record<string, any> = {}
          if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
            Object.assign(merged, args[1])
          }
          merged.message = args[0]
          childLogger.warn(merged)
        } else {
          ;(childLogger.warn as any)(...args)
        }
      },
      error: (...args: any[]) => {
        if (typeof args[0] === 'string' && args.length > 1) {
          const merged: Record<string, any> = {}
          if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
            Object.assign(merged, args[1])
          }
          merged.message = args[0]
          childLogger.error(merged)
        } else {
          ;(childLogger.error as any)(...args)
        }
      },
      debug: (...args: any[]) => (childLogger.debug as any)(...args),
      fatal: (...args: any[]) => (childLogger.fatal as any)(...args),
      child: logger.child.bind(logger), // recursive child creation
    }
  },
}

export default logger
export { logger }

// ─── Legacy Logger Types ─────────────────────────────────────

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
 * FIX HIGH: Route through pino to respect PII redaction instead of raw console.log
 */
export function logInfo(tag: LogTag, step: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = { tag: `[${tag}]`, step, status: 'info', meta }
  _pino.info(JSON.parse(formatEntry(entry)))
}

/**
 * Log a successful operation.
 */
export function logOk(tag: LogTag, step: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = { tag: `[${tag}]`, step, status: 'ok', meta }
  _pino.info(JSON.parse(formatEntry(entry)))
}

/**
 * Log a warning (non-fatal).
 */
export function logWarn(tag: LogTag, step: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = { tag: `[${tag}]`, step, status: 'warn', meta }
  _pino.warn(JSON.parse(formatEntry(entry)))
}

/**
 * Log an error (fatal or important).
 * Also stores it as the last error for the debug endpoint.
 */
export function logError(tag: LogTag, step: string, error: unknown, meta: Record<string, unknown> = {}) {
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
  _pino.error(JSON.parse(formatEntry(entry)))
}

/**
 * Create a step timer for measuring latency.
 */
export function logTimer(tag: LogTag, step: string) {
  const start = Date.now()
  return {
    /**
     * End the timer and log with status.
     */
    end(status: 'ok' | 'error' | 'warn' | 'info', meta: Record<string, unknown> = {}) {
      const latencyMs = Date.now() - start
      const entry: LogEntry = { tag: `[${tag}]`, step, status, meta, latencyMs }
      const parsed = JSON.parse(formatEntry(entry))
      if (status === 'error') _pino.error(parsed)
      else if (status === 'warn') _pino.warn(parsed)
      else _pino.info(parsed)
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
