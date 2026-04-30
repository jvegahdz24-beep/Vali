// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Notification System
// Sends real-time CRM event alerts to admin via Telegram Bot API.
// All notifications are async + non-blocking — failures are
// silently logged and never throw. If env vars are missing, the
// module becomes a no-op.
// ═══════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────

/** Supported event types for CRM notifications */
export type TelegramEventType =
  | 'hot_lead'
  | 'closing_attempt'
  | 'appointment_scheduled'
  | 'llm_failure'
  | 'new_lead'
  | 'follow_up_sent'

/** Per-event data payloads — each event carries relevant context */
export interface TelegramEventData {
  // ─── hot_lead ───
  phone?: string
  score?: number
  name?: string
  // ─── closing_attempt ───
  closability?: number
  technique?: string
  // ─── appointment_scheduled ───
  appointmentTitle?: string
  appointmentDate?: string
  // ─── llm_failure ───
  error?: string
  // ─── new_lead ───
  source?: string
  // ─── follow_up_sent ───
  taskType?: string
}

/** Options for the low-level send function */
export interface SendNotificationOptions {
  parse_mode?: 'HTML' | 'Markdown'
}

// ─── PII Masking ─────────────────────────────────────────────
// Matches the maskPhone pattern in message-processor.ts:
// first 3 chars + **** + last 3 chars

/**
 * Mask a phone number for safe display in notifications.
 * Format: 521****789 (first 3 + **** + last 3)
 */
export function maskPhone(phone: string | undefined): string {
  if (!phone || phone.length < 4) return '***'
  return phone.slice(0, 3) + '****' + phone.slice(-3)
}

// ─── Rate Limiter (max 1 msg/sec to avoid Telegram API bans) ──

const TELEGRAM_MIN_INTERVAL_MS = 1000 // 1 second between messages
let _lastSendTime = 0
let _pendingQueue: Array<{ message: string; options?: SendNotificationOptions }> = []
let _isProcessing = false

/**
 * Internal: drain the message queue, respecting the 1 msg/sec limit.
 * Each message waits until enough time has passed since the last send.
 */
async function drainQueue(): Promise<void> {
  if (_isProcessing) return // already draining
  _isProcessing = true

  try {
    while (_pendingQueue.length > 0) {
      const item = _pendingQueue.shift()!
      const now = Date.now()
      const elapsed = now - _lastSendTime
      const delay = Math.max(0, TELEGRAM_MIN_INTERVAL_MS - elapsed)

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      await sendTelegramNotificationInternal(item.message, item.options)
      _lastSendTime = Date.now()
    }
  } finally {
    _isProcessing = false
  }
}

// ─── Message Formatting ──────────────────────────────────────
// Each event type has an emoji prefix and a specific template.

/** Emoji + template map for each event type */
const EVENT_TEMPLATES: Record<TelegramEventType, (data: TelegramEventData) => string> = {
  hot_lead: (data) => {
    const phone = maskPhone(data.phone)
    const name = data.name || 'Desconocido'
    const score = data.score ?? 0
    return [
      `🔥 <b>HOT LEAD — Score: ${score}</b>`,
      ``,
      `👤 ${name}`,
      `📱 ${phone}`,
      `⚡ El lead score superó 80 — ¡momento ideal para cerrar!`,
    ].join('\n')
  },

  closing_attempt: (data) => {
    const phone = maskPhone(data.phone)
    const closability = data.closability ?? 0
    const technique = data.technique || 'N/A'
    return [
      `🎯 <b>Intento de Cierre</b>`,
      ``,
      `📱 ${phone}`,
      `📊 Closability: ${closability}/100`,
      `🧠 Técnica: <code>${technique}</code>`,
      ``,
      `El RevenueEngine activó el ClosingEngine.`,
    ].join('\n')
  },

  appointment_scheduled: (data) => {
    const phone = maskPhone(data.phone)
    const name = data.name || 'Desconocido'
    const title = data.appointmentTitle || 'Cita'
    const date = data.appointmentDate || 'Por confirmar'
    return [
      `📅 <b>Cita Agendada</b>`,
      ``,
      `👤 ${name}`,
      `📱 ${phone}`,
      `📋 ${title}`,
      `🕐 ${date}`,
    ].join('\n')
  },

  llm_failure: (data) => {
    const phone = maskPhone(data.phone)
    const error = (data.error || 'Unknown error').slice(0, 200)
    return [
      `⚠️ <b>Fallo LLM</b>`,
      ``,
      `📱 ${phone}`,
      `❌ Error: <code>${escapeHtml(error)}</code>`,
      ``,
      `El LLM falló o agotó el timeout.`,
    ].join('\n')
  },

  new_lead: (data) => {
    const phone = maskPhone(data.phone)
    const name = data.name || 'Desconocido'
    const source = data.source || 'unknown'
    return [
      `🆕 <b>Nuevo Lead</b>`,
      ``,
      `👤 ${name}`,
      `📱 ${phone}`,
      `📥 Canal: ${source}`,
    ].join('\n')
  },

  follow_up_sent: (data) => {
    const phone = maskPhone(data.phone)
    const taskType = data.taskType || 'follow-up'
    return [
      `✉️ <b>Follow-up Enviado</b>`,
      ``,
      `📱 ${phone}`,
      `🏷 Tipo: ${taskType}`,
    ].join('\n')
  },
}

/**
 * Escape special HTML characters for Telegram HTML parse mode.
 * Prevents breaking the message if data contains <, >, &, etc.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Config Check ────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

/** True when both env vars are set and non-empty */
function isConfigured(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID)
}

// ─── Core Send Function ──────────────────────────────────────

/**
 * Send a message to the admin Telegram chat.
 * Truncates to 4096 chars (Telegram limit).
 * Never throws — errors are caught and logged as warnings.
 *
 * If TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is not set,
 * silently does nothing (no error logged).
 *
 * @param message - The message text to send
 * @param options - Optional parse_mode ('HTML' | 'Markdown')
 */
export async function sendTelegramNotification(
  message: string,
  options?: SendNotificationOptions,
): Promise<void> {
  if (!isConfigured()) return // silently skip

  try {
    await sendTelegramNotificationInternal(message, options)
  } catch (err) {
    // Non-critical: log and never throw
    console.warn(
      '[Telegram] sendNotification failed (non-critical):',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Internal send implementation — actually calls the Telegram API.
 * Separated so the rate-limited queue can call it directly.
 */
async function sendTelegramNotificationInternal(
  message: string,
  options?: SendNotificationOptions,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  // Telegram max message length is 4096 characters
  const truncated = message.length > 4096
    ? message.slice(0, 4090) + '\n...'
    : message

  const body: Record<string, unknown> = {
    chat_id: TELEGRAM_ADMIN_CHAT_ID,
    text: truncated,
  }

  if (options?.parse_mode) {
    body.parse_mode = options.parse_mode
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown')
    console.warn(
      `[Telegram] API returned ${response.status}: ${errorText.slice(0, 200)}`,
    )
  }
}

// ─── High-Level Event Helper ─────────────────────────────────

/**
 * Send a typed CRM event notification to Telegram.
 * Queues the message and respects the 1 msg/sec rate limit.
 * Async + non-blocking — safe to call with `.catch(() => {})`.
 *
 * @param type  - The event type (hot_lead, closing_attempt, etc.)
 * @param data  - Event-specific data payload
 *
 * @example
 * // Fire-and-forget pattern (non-blocking):
 * notifyEvent('hot_lead', { phone: '+5215512345678', score: 92, name: 'Juan' }).catch(() => {})
 */
export async function notifyEvent(
  type: TelegramEventType,
  data: TelegramEventData,
): Promise<void> {
  if (!isConfigured()) return // silently skip

  try {
    const templateFn = EVENT_TEMPLATES[type]
    if (!templateFn) return // unknown event type — skip silently

    const message = templateFn(data)

    // Enqueue for rate-limited delivery
    _pendingQueue.push({ message, options: { parse_mode: 'HTML' } })

    // Start draining (no-op if already processing)
    drainQueue().catch(() => {
      // Queue drain failure — non-critical
    })
  } catch (err) {
    // Non-critical: log and never throw
    console.warn(
      `[Telegram] notifyEvent('${type}') failed (non-critical):`,
      err instanceof Error ? err.message : err,
    )
  }
}
