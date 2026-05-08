// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Event Bus Subscriber Wiring
// Connects event bus events to real actions:
//   ghosting.detected     → recovery_agent + Telegram
//   nexus.energy_changed  → emotional_support + Telegram (low energy)
//   deal.stage_changed    → closing_agent (when stage = closing)
//   message.received      → fire-and-forget analytics update
//   tool.called           → structured log
//   system.error          → Telegram error alert
// ═══════════════════════════════════════════════════════════════

import { eventBus, EVENT_TYPES, type EventEnvelope } from '@/lib/event-bus'
import { spawnFromEvent } from '@/lib/ephemeral-agents'
import { sendNotification } from '@/lib/telegram-control'
import { computeEngagement } from '@/lib/analytics-advanced'
import { db } from '@/lib/db'
import { logInfo, logWarn, logError } from '@/lib/logger'

// ─── Subscriber Registry ────────────────────────────────────

/**
 * Stores unsubscribe functions returned by eventBus.on().
 * Used for cleanup in unregisterEventSubscribers().
 */
const unsubscribers: Array<() => void> = []

/**
 * Tracks how many active listeners are registered by this module.
 */
let _registeredCount = 0

/**
 * Returns the current count of registered listeners.
 */
export function getRegisteredListenerCount(): number {
  return _registeredCount
}

// ─── Subscriber Handler: ghosting.detected ─────────────────
// Spawns recovery_agent ephemeral agent and sends Telegram notification.

async function handleGhostingDetected(event: EventEnvelope<'ghosting.detected'>): Promise<void> {
  const { contactId, conversationId, workspaceId, hoursSinceLastMessage, lastStage } = event.payload

  logInfo('EVENT_BUS', 'subscriber:ghosting_detected', {
    contactId,
    workspaceId,
    hoursSinceLastMessage,
    lastStage,
  })

  // 1. Spawn recovery_agent ephemeral agent (fire-and-forget, don't block Telegram)
  spawnFromEvent(EVENT_TYPES.GHOSTING_DETECTED, workspaceId, contactId, {
    conversationId,
    hoursSinceLastMessage,
    lastStage,
  }).catch((err) => {
    logWarn('EVENT_BUS', 'subscriber:ghosting_spawn_failed', {
      contactId,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  // 2. Send Telegram notification
  try {
    await sendNotification({
      type: 'ghosting_detected',
      workspaceId,
      title: 'Ghosting Detected',
      body: `Contacto no responde desde ${hoursSinceLastMessage.toFixed(1)} horas. Se ha activado el agente de recuperación.`,
      metadata: {
        contactId,
        conversationId,
        hoursSinceLastMessage: hoursSinceLastMessage.toFixed(1),
        ...(lastStage ? { stage: lastStage } : {}),
      },
    })
  } catch (err) {
    logWarn('EVENT_BUS', 'subscriber:ghosting_telegram_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── Subscriber Handler: nexus.energy_changed ──────────────
// If energy < 30, spawns emotional_support agent + sends Telegram alert.

async function handleNexusEnergyChanged(event: EventEnvelope<'nexus.energy_changed'>): Promise<void> {
  const { userId, oldScore, newScore, breakdown, label } = event.payload

  // Only act when energy drops below 30
  if (newScore >= 30) return

  logInfo('EVENT_BUS', 'subscriber:nexus_low_energy', {
    userId,
    oldScore,
    newScore,
    label,
  })

  // Try to find a workspace for this user
  let workspaceId = ''
  try {
    const member = await db.workspaceMember.findFirst({
      where: { userId },
      select: { workspaceId: true },
    })
    workspaceId = member?.workspaceId || ''
  } catch {
    // Can't find workspace — skip agent spawn and Telegram
    logWarn('EVENT_BUS', 'subscriber:nexus_no_workspace', { userId })
    return
  }

  if (!workspaceId) return

  // 1. Spawn emotional_support agent (fire-and-forget)
  spawnFromEvent(EVENT_TYPES.NEXUS_ENERGY_CHANGED, workspaceId, undefined, {
    userId,
    oldScore,
    newScore,
    breakdown,
    label,
  }).catch((err) => {
    logWarn('EVENT_BUS', 'subscriber:nexus_spawn_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  // 2. Send Telegram alert
  try {
    await sendNotification({
      type: 'nexus_emotional_alert',
      workspaceId,
      title: 'Low Energy Alert',
      body: `NEXUS energy dropped to ${newScore}/100 (was ${oldScore}). Emotional support agent activated.${label ? ` Label: ${label}` : ''}`,
      metadata: {
        userId,
        oldScore,
        newScore: newScore,
      },
    })
  } catch (err) {
    logWarn('EVENT_BUS', 'subscriber:nexus_telegram_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── Subscriber Handler: deal.stage_changed ─────────────────
// If stage is 'closing', spawns closing_agent ephemeral agent.

async function handleDealStageChanged(event: EventEnvelope<'deal.stage_changed'>): Promise<void> {
  const { dealId, workspaceId, contactId, fromStageId, toStageId, toStageName, value } = event.payload

  // Check if the new stage indicates "closing"
  const stageLower = toStageName.toLowerCase()
  const isClosing =
    stageLower.includes('closing') ||
    stageLower.includes('cierre') ||
    stageLower.includes('ganad') ||
    stageLower.includes('won') ||
    stageLower.includes('close')

  if (!isClosing) return

  logInfo('EVENT_BUS', 'subscriber:deal_closing', {
    dealId,
    workspaceId,
    contactId,
    toStageName,
  })

  // Spawn closing_agent ephemeral agent (fire-and-forget)
  spawnFromEvent('deal_stage_closing', workspaceId, contactId, {
    dealId,
    toStageName,
    value,
    fromStageId,
    toStageId,
  }).catch((err) => {
    logWarn('EVENT_BUS', 'subscriber:closing_spawn_failed', {
      dealId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

// ─── Subscriber Handler: message.received ───────────────────
// Fire-and-forget: updates engagement analytics for the contact.

async function handleMessageReceived(event: EventEnvelope<'message.received'>): Promise<void> {
  const { contactId, messageId, conversationId, channel, content } = event.payload

  if (!contactId) return

  // Fire-and-forget — update engagement score in background
  computeEngagement(contactId)
    .then((engagement) => {
      logInfo('EVENT_BUS', 'subscriber:engagement_updated', {
        contactId,
        messageId,
        score: engagement.score,
        energyLevel: engagement.energyLevel,
      })
    })
    .catch((err) => {
      logWarn('EVENT_BUS', 'subscriber:engagement_failed', {
        contactId,
        messageId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

// ─── Subscriber Handler: tool.called ───────────────────────
// Logs tool usage with structured metadata.

async function handleToolCalled(event: EventEnvelope<'tool.called'>): Promise<void> {
  const { toolName, conversationId, agentId, latencyMs, success } = event.payload

  logInfo('EVENT_BUS', 'subscriber:tool_called', {
    toolName,
    conversationId,
    agentId,
    latencyMs,
    success,
  })
}

// ─── Subscriber Handler: system.error ──────────────────────
// Sends Telegram error notification.

async function handleSystemError(event: EventEnvelope<'system.error'>): Promise<void> {
  const { error, stack, context, source } = event.payload

  logError('EVENT_BUS', 'subscriber:system_error', {
    error: error.slice(0, 200),
    source,
    context,
  })

  // Find any active workspace with a configured Telegram bot
  let workspaceId = ''
  try {
    const bot = await db.telegramBot.findFirst({
      where: { isActive: true, chatId: { not: null } },
      select: { workspaceId: true },
    })
    workspaceId = bot?.workspaceId || ''
  } catch {
    // No workspace found — can't send Telegram
    logWarn('EVENT_BUS', 'subscriber:error_no_workspace', {})
    return
  }

  if (!workspaceId) return

  try {
    await sendNotification({
      type: 'error_alert',
      workspaceId,
      title: 'System Error',
      body: `${error.slice(0, 300)}${context ? `\nContext: ${context}` : ''}${source ? `\nSource: ${source}` : ''}`,
      metadata: {
        ...(context ? { context } : {}),
        ...(source ? { source } : {}),
      },
    })
  } catch (err) {
    logWarn('EVENT_BUS', 'subscriber:error_telegram_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// Registration / Unregistration
// ═══════════════════════════════════════════════════════════════

/**
 * Register all event bus subscribers.
 * Call this once at application startup.
 */
export function registerEventSubscribers(): void {
  // Avoid double-registration
  if (_registeredCount > 0) {
    logWarn('EVENT_BUS', 'subscriber:already_registered', { count: _registeredCount })
    return
  }

  // ghosting.detected → recovery_agent + Telegram
  unsubscribers.push(
    eventBus.on(EVENT_TYPES.GHOSTING_DETECTED, async (event) => {
      try {
        await handleGhostingDetected(event as EventEnvelope<'ghosting.detected'>)
      } catch (err) {
        logError('EVENT_BUS', 'handler_error:ghosting_detected', err, {
          eventId: event.id,
        })
      }
    }),
  )

  // nexus.energy_changed → emotional_support (low energy) + Telegram
  unsubscribers.push(
    eventBus.on(EVENT_TYPES.NEXUS_ENERGY_CHANGED, async (event) => {
      try {
        await handleNexusEnergyChanged(event as EventEnvelope<'nexus.energy_changed'>)
      } catch (err) {
        logError('EVENT_BUS', 'handler_error:nexus.energy_changed', err, {
          eventId: event.id,
        })
      }
    }),
  )

  // deal.stage_changed → closing_agent (when stage = closing)
  unsubscribers.push(
    eventBus.on(EVENT_TYPES.DEAL_STAGE_CHANGED, async (event) => {
      try {
        await handleDealStageChanged(event as EventEnvelope<'deal.stage_changed'>)
      } catch (err) {
        logError('EVENT_BUS', 'handler_error:deal.stage_changed', err, {
          eventId: event.id,
        })
      }
    }),
  )

  // message.received → fire-and-forget engagement update
  unsubscribers.push(
    eventBus.on(EVENT_TYPES.MESSAGE_RECEIVED, async (event) => {
      try {
        await handleMessageReceived(event as EventEnvelope<'message.received'>)
      } catch (err) {
        logError('EVENT_BUS', 'handler_error:message.received', err, {
          eventId: event.id,
        })
      }
    }),
  )

  // tool.called → structured log
  unsubscribers.push(
    eventBus.on(EVENT_TYPES.TOOL_CALLED, async (event) => {
      try {
        await handleToolCalled(event as EventEnvelope<'tool.called'>)
      } catch (err) {
        logError('EVENT_BUS', 'handler_error:tool.called', err, {
          eventId: event.id,
        })
      }
    }),
  )

  // system.error → Telegram error alert
  unsubscribers.push(
    eventBus.on(EVENT_TYPES.SYSTEM_ERROR, async (event) => {
      try {
        await handleSystemError(event as EventEnvelope<'system.error'>)
      } catch (err) {
        logError('EVENT_BUS', 'handler_error:system.error', err, {
          eventId: event.id,
        })
      }
    }),
  )

  _registeredCount = unsubscribers.length

  logInfo('EVENT_BUS', 'subscribers_registered', {
    count: _registeredCount,
    events: [
      EVENT_TYPES.GHOSTING_DETECTED,
      EVENT_TYPES.NEXUS_ENERGY_CHANGED,
      EVENT_TYPES.DEAL_STAGE_CHANGED,
      EVENT_TYPES.MESSAGE_RECEIVED,
      EVENT_TYPES.TOOL_CALLED,
      EVENT_TYPES.SYSTEM_ERROR,
    ],
  })
}

/**
 * Unregister all event bus subscribers.
 * Call this on application shutdown or when re-registering.
 */
export function unregisterEventSubscribers(): void {
  for (const unsub of unsubscribers) {
    try {
      unsub()
    } catch (err) {
      logWarn('EVENT_BUS', 'unregister_error', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  unsubscribers.length = 0
  const previousCount = _registeredCount
  _registeredCount = 0

  logInfo('EVENT_BUS', 'subscribers_unregistered', { previousCount })
}
