// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — Observability Module
// Barrel export for tracing and metrics
// ═══════════════════════════════════════════════════════════════

// ─── Tracing ──────────────────────────────────────────────────
export {
  startSpan,
  traceMiddleware,
  getTrace,
  getRecentTraces,
  getTraceStats,
  getActiveTraceId,
  getActiveParentId,
  withTraceContext,
  generateTraceId,
  generateSpanId,
  clearTraces,
} from './tracing'

export type {
  SpanStatus,
  SpanAttributes,
  CompletedSpan,
  ActiveSpan,
  TraceSnapshot,
} from './tracing'

// ─── Metrics ──────────────────────────────────────────────────
export {
  incrementCounter,
  getCounter,
  recordHistogram,
  getHistogramPercentile,
  getHistogramCount,
  getHistogramMean,
  setGauge,
  getGauge,
  incGauge,
  decGauge,
  exportMetrics,
  resetMetrics,
  getRegisteredMetrics,
} from './metrics'

export type { LabelValues, MetricMeta } from './metrics'
