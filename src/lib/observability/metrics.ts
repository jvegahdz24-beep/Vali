// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — Metrics Collection
// In-process counters for Prometheus-compatible exposition
// Graceful degradation: never crash the app if metrics fail
// ═══════════════════════════════════════════════════════════════

import { logWarn } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────

export type LabelValues = Record<string, string>

export interface MetricMeta {
  name: string
  help: string
  type: 'counter' | 'histogram' | 'gauge'
  labelNames: string[]
}

// ─── Label Key ────────────────────────────────────────────────

/**
 * Serialize label values into a deterministic string key.
 * E.g. { method: "GET", path: "/api/health" } → 'method="GET",path="/api/health"'
 */
function labelKey(labels: LabelValues): string {
  const keys = Object.keys(labels).sort()
  return keys.map((k) => `${k}="${labels[k]}"`).join(',')
}

// ─── Counter ──────────────────────────────────────────────────

class Counter {
  private values = new Map<string, number>()

  constructor(
    public name: string,
    public help: string,
    public labelNames: string[]
  ) {}

  increment(labels: LabelValues = {}, value: number = 1): void {
    try {
      const key = labelKey(labels)
      const current = this.values.get(key) || 0
      this.values.set(key, current + value)
    } catch (err) {
      logWarn('CORE', 'counter_increment_failed', { name: this.name, error: String(err) })
    }
  }

  get(labels: LabelValues = {}): number {
    const key = labelKey(labels)
    return this.values.get(key) || 0
  }

  /** Return all (labelKey, value) pairs for exposition. */
  entries(): Array<{ key: string; labels: LabelValues; value: number }> {
    const result: Array<{ key: string; labels: LabelValues; value: number }> = []
    // Also emit the _total line with no labels
    const total = this.getTotal()
    if (total > 0) {
      result.push({ key: '', labels: {}, value: total })
    }
    Array.from(this.values.entries()).forEach(([key, value]) => {
      result.push({
        key,
        labels: parseLabelKey(key),
        value,
      })
    })
    return result
  }

  getTotal(): number {
    let total = 0
    Array.from(this.values.values()).forEach((value) => {
      total += value
    })
    return total
  }
}

// ─── Histogram ────────────────────────────────────────────────

/** Default bucket boundaries for seconds (exponential). */
const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
]

/**
 * Prometheus-compatible histogram with configurable buckets.
 * Stores observations in fixed upper-bound buckets.
 */
class Histogram {
  private buckets: number[]
  private data = new Map<string, number[]>()  // key → sorted observations

  constructor(
    public name: string,
    public help: string,
    public labelNames: string[],
    buckets?: number[]
  ) {
    this.buckets = buckets || DEFAULT_BUCKETS
  }

  record(value: number, labels: LabelValues = {}): void {
    try {
      const key = labelKey(labels)
      const observations = this.data.get(key) || []
      observations.push(value)
      this.data.set(key, observations)
    } catch (err) {
      logWarn('CORE', 'histogram_record_failed', { name: this.name, error: String(err) })
    }
  }

  /** Get a specific percentile for the given labels. */
  getPercentile(p: number, labels: LabelValues = {}): number {
    const key = labelKey(labels)
    const observations = this.data.get(key)
    if (!observations || observations.length === 0) return 0

    const sorted = [...observations].sort((a, b) => a - b)
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  /** Get all observations count for labels. */
  getCount(labels: LabelValues = {}): number {
    const key = labelKey(labels)
    return (this.data.get(key) || []).length
  }

  /** Get sum of all observations for labels. */
  getSum(labels: LabelValues = {}): number {
    const key = labelKey(labels)
    const observations = this.data.get(key) || []
    return observations.reduce((acc, v) => acc + v, 0)
  }

  /** Get the mean for labels. */
  getMean(labels: LabelValues = {}): number {
    const count = this.getCount(labels)
    if (count === 0) return 0
    return this.getSum(labels) / count
  }

  /** Return all data for exposition (bucket counts per label set). */
  entries(): Array<{
    key: string
    labels: LabelValues
    count: number
    sum: number
    buckets: { upperBound: number; count: number }[]
  }> {
    const result: Array<{
      key: string
      labels: LabelValues
      count: number
      sum: number
      buckets: { upperBound: number; count: number }[]
    }> = []

    Array.from(this.data.entries()).forEach(([key, observations]) => {
      const sorted = [...observations].sort((a, b) => a - b)
      const buckets = this.buckets.map((upper) => ({
        upperBound: upper,
        count: sorted.filter((v) => v <= upper).length,
      }))

      result.push({
        key,
        labels: parseLabelKey(key),
        count: observations.length,
        sum: observations.reduce((a, b) => a + b, 0),
        buckets,
      })
    })

    return result
  }
}

// ─── Gauge ────────────────────────────────────────────────────

class Gauge {
  private values = new Map<string, number>()

  constructor(
    public name: string,
    public help: string,
    public labelNames: string[]
  ) {}

  set(value: number, labels: LabelValues = {}): void {
    try {
      const key = labelKey(labels)
      this.values.set(key, value)
    } catch (err) {
      logWarn('CORE', 'gauge_set_failed', { name: this.name, error: String(err) })
    }
  }

  get(labels: LabelValues = {}): number {
    const key = labelKey(labels)
    return this.values.get(key) || 0
  }

  /** Increment the gauge value. */
  inc(labels: LabelValues = {}, value: number = 1): void {
    try {
      const key = labelKey(labels)
      const current = this.values.get(key) || 0
      this.values.set(key, current + value)
    } catch (err) {
      logWarn('CORE', 'gauge_inc_failed', { name: this.name, error: String(err) })
    }
  }

  /** Decrement the gauge value. */
  dec(labels: LabelValues = {}, value: number = 1): void {
    try {
      const key = labelKey(labels)
      const current = this.values.get(key) || 0
      this.values.set(key, current - value)
    } catch (err) {
      logWarn('CORE', 'gauge_dec_failed', { name: this.name, error: String(err) })
    }
  }

  entries(): Array<{ key: string; labels: LabelValues; value: number }> {
    const result: Array<{ key: string; labels: LabelValues; value: number }> = []
    Array.from(this.values.entries()).forEach(([key, value]) => {
      result.push({
        key,
        labels: parseLabelKey(key),
        value,
      })
    })
    return result
  }
}

// ─── Label Key Parser ─────────────────────────────────────────

/**
 * Reverse-parse a labelKey back into a LabelValues object.
 * Handles the format: key1="val1",key2="val2"
 */
function parseLabelKey(key: string): LabelValues {
  if (!key) return {}
  const labels: LabelValues = {}
  // Match pattern: word="value" or word="value with spaces"
  const regex = /(\w+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(key)) !== null) {
    labels[match[1]] = match[2]
  }
  return labels
}

// ─── Metric Registry ──────────────────────────────────────────

interface MetricInstance {
  meta: MetricMeta
  instance: Counter | Histogram | Gauge
}

const registry = new Map<string, MetricInstance>()

function register(metric: MetricInstance): void {
  registry.set(metric.meta.name, metric)
}

function getRegistered(name: string): MetricInstance | undefined {
  return registry.get(name)
}

// ─── Pre-defined Metrics ─────────────────────────────────────

// ── HTTP metrics ──────────────────────────────────────────────
function registerCounter(name: string, help: string, labelNames: string[]): Counter {
  const counter = new Counter(name, help, labelNames)
  register({
    meta: { name, help, type: 'counter', labelNames },
    instance: counter,
  })
  return counter
}

function registerHistogram(name: string, help: string, labelNames: string[], buckets?: number[]): Histogram {
  const histogram = new Histogram(name, help, labelNames, buckets)
  register({
    meta: { name, help, type: 'histogram', labelNames },
    instance: histogram,
  })
  return histogram
}

function registerGauge(name: string, help: string, labelNames: string[]): Gauge {
  const gauge = new Gauge(name, help, labelNames)
  register({
    meta: { name, help, type: 'gauge', labelNames },
    instance: gauge,
  })
  return gauge
}

// ── HTTP metrics ──────────────────────────────────────────────
registerCounter(
  'http_requests_total',
  'Total number of HTTP requests',
  ['method', 'path', 'status']
)

registerHistogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
  ['method', 'path']
)

// ── Message metrics ───────────────────────────────────────────
registerCounter(
  'messages_received_total',
  'Total messages received by channel',
  ['channel']
)

registerCounter(
  'messages_sent_total',
  'Total messages sent by channel and AI status',
  ['channel', 'is_ai_generated']
)

// ── AI metrics ────────────────────────────────────────────────
registerCounter(
  'ai_requests_total',
  'Total AI API requests by provider and model',
  ['provider', 'model']
)

registerHistogram(
  'ai_request_duration_seconds',
  'AI request duration in seconds',
  ['provider', 'model']
)

// ── WebSocket metrics ─────────────────────────────────────────
registerGauge(
  'active_websocket_connections',
  'Current number of active WebSocket connections',
  []
)

// ── Queue metrics ─────────────────────────────────────────────
registerCounter(
  'queue_jobs_total',
  'Total queue jobs processed by queue and status',
  ['queue', 'status']
)

// ── Database metrics ──────────────────────────────────────────
registerHistogram(
  'db_query_duration_seconds',
  'Database query duration in seconds',
  ['operation']
)

// ─── Public API ───────────────────────────────────────────────

// ── Counter operations ────────────────────────────────────────

/**
 * Increment a counter metric.
 * @param name - Metric name (e.g. 'http_requests_total')
 * @param labels - Label key-value pairs
 * @param value - Increment amount (default 1)
 */
export function incrementCounter(name: string, labels?: LabelValues, value?: number): void {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Counter) {
    registered.instance.increment(labels || {}, value || 1)
  }
}

/**
 * Get the current value of a counter for the given labels.
 */
export function getCounter(name: string, labels?: LabelValues): number {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Counter) {
    return registered.instance.get(labels || {})
  }
  return 0
}

// ── Histogram operations ──────────────────────────────────────

/**
 * Record a value in a histogram metric.
 * @param name - Metric name (e.g. 'http_request_duration_seconds')
 * @param value - Observed value (e.g. duration in seconds)
 * @param labels - Label key-value pairs
 */
export function recordHistogram(name: string, value: number, labels?: LabelValues): void {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Histogram) {
    registered.instance.record(value, labels || {})
  }
}

/**
 * Get a percentile value from a histogram.
 * @param name - Metric name
 * @param p - Percentile (0-100), e.g. 50, 90, 95, 99
 * @param labels - Label key-value pairs
 */
export function getHistogramPercentile(name: string, p: number, labels?: LabelValues): number {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Histogram) {
    return registered.instance.getPercentile(p, labels || {})
  }
  return 0
}

/**
 * Get histogram count for given labels.
 */
export function getHistogramCount(name: string, labels?: LabelValues): number {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Histogram) {
    return registered.instance.getCount(labels || {})
  }
  return 0
}

/**
 * Get histogram mean for given labels.
 */
export function getHistogramMean(name: string, labels?: LabelValues): number {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Histogram) {
    return registered.instance.getMean(labels || {})
  }
  return 0
}

// ── Gauge operations ──────────────────────────────────────────

/**
 * Set a gauge metric value.
 * @param name - Metric name (e.g. 'active_websocket_connections')
 * @param value - Numeric value
 * @param labels - Label key-value pairs
 */
export function setGauge(name: string, value: number, labels?: LabelValues): void {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Gauge) {
    registered.instance.set(value, labels || {})
  }
}

/**
 * Get the current value of a gauge.
 */
export function getGauge(name: string, labels?: LabelValues): number {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Gauge) {
    return registered.instance.get(labels || {})
  }
  return 0
}

/**
 * Increment a gauge metric.
 */
export function incGauge(name: string, labels?: LabelValues, value?: number): void {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Gauge) {
    registered.instance.inc(labels || {}, value || 1)
  }
}

/**
 * Decrement a gauge metric.
 */
export function decGauge(name: string, labels?: LabelValues, value?: number): void {
  const registered = getRegistered(name)
  if (registered && registered.instance instanceof Gauge) {
    registered.instance.dec(labels || {}, value || 1)
  }
}

// ─── Prometheus Text Exposition ───────────────────────────────

/**
 * Export all registered metrics in Prometheus text exposition format.
 * See: https://prometheus.io/docs/instrumenting/exposition_formats/
 */
export function exportMetrics(): string {
  try {
    const lines: string[] = []
    lines.push('# Generated by ValiAutoFlow CRM v5.2.0 Observability')
    lines.push(`# ${new Date().toISOString()}`)
    lines.push('')

    Array.from(registry.values()).forEach((metric) => {
      const { meta, instance } = metric

      // Type and help headers
      lines.push(`# HELP ${meta.name} ${meta.help}`)
      lines.push(`# TYPE ${meta.name} ${meta.type}`)

      if (instance instanceof Counter) {
        for (const entry of instance.entries()) {
          if (entry.key) {
            lines.push(`${meta.name}{${entry.key}} ${entry.value}`)
          }
        }
      } else if (instance instanceof Histogram) {
        for (const entry of instance.entries()) {
          const labelStr = entry.key ? `{${entry.key},` : '{'
          // Bucket lines
          for (const bucket of entry.buckets) {
            const leStr = bucket.upperBound === Infinity
              ? 'le="+Inf"'
              : `le="${bucket.upperBound}"`
            lines.push(
              `${meta.name}_bucket${labelStr}${leStr}} ${bucket.count}`
            )
          }
          // +Inf bucket (total count)
          lines.push(`${meta.name}_bucket${labelStr}le="+Inf"} ${entry.count}`)
          // Sum
          lines.push(`${meta.name}_sum${labelStr.slice(0, -1)}} ${entry.sum}`)
          // Count
          lines.push(`${meta.name}_count${labelStr.slice(0, -1)}} ${entry.count}`)
        }
      } else if (instance instanceof Gauge) {
        for (const entry of instance.entries()) {
          if (entry.key) {
            lines.push(`${meta.name}{${entry.key}} ${entry.value}`)
          } else {
            lines.push(`${meta.name} ${entry.value}`)
          }
        }
      }

      lines.push('')
    })

    return lines.join('\n')
  } catch (err) {
    logWarn('CORE', 'metrics_export_failed', { error: String(err) })
    return '# Metrics export failed\n'
  }
}

/**
 * Reset all metrics. Useful in tests.
 */
export function resetMetrics(): void {
  Array.from(registry.values()).forEach((metric) => {
    if (metric.instance instanceof Counter) {
      (metric.instance as unknown as { values: Map<string, number> }).values.clear()
    } else if (metric.instance instanceof Histogram) {
      (metric.instance as unknown as { data: Map<string, number[]> }).data.clear()
    } else if (metric.instance instanceof Gauge) {
      (metric.instance as unknown as { values: Map<string, number> }).values.clear()
    }
  })
}

/**
 * Get all registered metric names.
 */
export function getRegisteredMetrics(): MetricMeta[] {
  return Array.from(registry.values()).map((m) => m.meta)
}

