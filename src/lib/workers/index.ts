// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — BullMQ Worker Registration
//
// Spawns one Worker per queue.  Each worker is a long-running
// process that polls Redis Streams and executes job processors.
//
// Workers:
//   FOLLOWUPS      → send scheduled follow-up messages via AI
//   EVENTS         → emit events through the EventBus
//   AI_TASKS       → run heavy AI work (embeddings, scoring)
//   SYNC           → contact imports, calendar sync
//   NOTIFICATIONS  → multi-channel delivery (email/whatsapp/telegram)
// ═══════════════════════════════════════════════════════════════

import { Job } from 'bullmq'
import { db } from '@/lib/db'
import { logInfo, logOk, logWarn, logError } from '@/lib/logger'
import {
  QUEUE_NAMES,
  createWorker,
  type QueueName,
} from '@/lib/queue'
import { eventBus, EVENT_TYPES } from '@/lib/event-bus'
import { sendEmail } from '@/lib/email'
import { evolutionAPI } from '@/lib/whatsapp/evolution-api'
import { sendNotification as sendTelegramNotification } from '@/lib/telegram-control'

// ─── Job Data Types ──────────────────────────────────────────

/** Follow-up job payload */
export interface FollowUpJobData {
  taskId: string
  contactId: string
  conversationId: string
  workspaceId: string
  channel: 'whatsapp' | 'telegram' | 'email'
  step: number
  tipo: string
}

/** Event job payload */
export interface EventJobData {
  eventType: string
  payload: Record<string, unknown>
  source?: string
  metadata?: Record<string, unknown>
}

/** AI task job payload */
export interface AITaskJobData {
  type: 'embedding' | 'lead_scoring' | 'batch_analysis' | 'context_summary'
  params: Record<string, unknown>
}

/** Sync job payload */
export interface SyncJobData {
  type: 'contact_import' | 'calendar_sync'
  workspaceId: string
  userId?: string
  params: Record<string, unknown>
}

/** Notification job payload */
export interface NotificationJobData {
  workspaceId: string
  channels: Array<'email' | 'whatsapp' | 'telegram'>
  type: 'followup_due' | 'deal_stage_change' | 'ghosting_detected' | 'new_message' | 'automation_triggered' | 'daily_summary' | 'weekly_report' | 'error_alert' | 'custom'
  title: string
  body: string
  contactName?: string
  to?: string              // email address or phone number
  metadata?: Record<string, unknown>
}

// ─── Worker References ───────────────────────────────────────

let followUpWorker: ReturnType<typeof createWorker<FollowUpJobData>> | null = null
let eventWorker: ReturnType<typeof createWorker<EventJobData>> | null = null
let aiWorker: ReturnType<typeof createWorker<AITaskJobData>> | null = null
let syncWorker: ReturnType<typeof createWorker<SyncJobData>> | null = null
let notificationWorker: ReturnType<typeof createWorker<NotificationJobData>> | null = null

// ═══════════════════════════════════════════════════════════════
//  1. FOLLOW-UP WORKER
// ═══════════════════════════════════════════════════════════════

async function processFollowUpJob(job: Job<FollowUpJobData>): Promise<{ sent: boolean; taskId: string }> {
  const { taskId, contactId, conversationId, workspaceId, channel, step, tipo } = job.data

  // ── Guard: load the task and verify it is still pending ──
  const task = await db.followUpTask.findUnique({
    where: { id: taskId },
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
      rule: { select: { name: true } },
    },
  })

  if (!task) {
    logWarn('FOLLOWUP', 'task_not_found', { taskId })
    return { sent: false, taskId }
  }

  if (task.status === 'sent' || task.status === 'cancelled') {
    logInfo('FOLLOWUP', 'task_already_handled', { taskId, status: task.status })
    return { sent: false, taskId }
  }

  // Mark as processing (protects against concurrent worker runs)
  await db.followUpTask.update({
    where: { id: taskId },
    data: { status: 'processing' },
  })

  // ── Re-check after marking (race condition guard) ──
  const fresh = await db.followUpTask.findUnique({ where: { id: taskId } })
  if (!fresh || fresh.status === 'cancelled') {
    logInfo('FOLLOWUP', 'task_cancelled_during_processing', { taskId })
    return { sent: false, taskId }
  }

  try {
    // Load workspace settings for AI context
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        settings: true,
      },
    })

    const workspaceSettings = (typeof workspace?.settings === 'string'
      ? JSON.parse(workspace.settings || '{}')
      : workspace?.settings) ?? {}

    // Dynamically import the follow-up engine to avoid circular deps
    const { generateFollowUpMessage, scheduleNextFollowUp } = await import('@/lib/ai/follow-up-engine')

    // Generate AI follow-up message
    const message = await generateFollowUpMessage(
      contactId,
      conversationId,
      tipo as any,
      workspaceSettings,
    )

    // Send via the appropriate channel
    const contact = task.contact
    const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    let sendSuccess = false

    switch (channel) {
      case 'whatsapp': {
        if (contact.phone && evolutionAPI.isEnabled()) {
          const result = await evolutionAPI.sendMessage(contact.phone, message)
          sendSuccess = result.success
          if (!sendSuccess) {
            logError('FOLLOWUP', 'whatsapp_send_failed', result.error ?? 'Unknown error', { taskId, phone: contact.phone })
          }
        } else {
          logWarn('FOLLOWUP', 'whatsapp_unavailable', { taskId, phone: contact.phone })
        }
        break
      }

      case 'telegram': {
        const result = await sendTelegramNotification({
          type: 'followup_due',
          workspaceId,
          title: `Seguimiento: ${task.rule?.name || 'Auto Follow-Up'}`,
          body: message,
          contactName: contactName || undefined,
        })
        sendSuccess = result.success
        if (!sendSuccess) {
          logError('FOLLOWUP', 'telegram_send_failed', result.error ?? 'Unknown error', { taskId })
        }
        break
      }

      case 'email': {
        if (contact.email) {
          const result = await sendEmail({
            to: contact.email,
            subject: `${task.rule?.name || 'Seguimiento'} — ${workspace?.name || 'ValiAutoFlow'}`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <p style="font-size:16px;line-height:1.6;color:#374151;">${message.replace(/\n/g, '<br>')}</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <p style="font-size:12px;color:#9ca3af;">Enviado por ValiAutoFlow CRM</p>
              </div>
            `,
          })
          sendSuccess = result.success
          if (!sendSuccess) {
            logError('FOLLOWUP', 'email_send_failed', result.error ?? 'Unknown error', { taskId })
          }
        } else {
          logWarn('FOLLOWUP', 'email_missing', { taskId })
        }
        break
      }
    }

    // ── Update task status ──
    await db.followUpTask.update({
      where: { id: taskId },
      data: {
        status: sendSuccess ? 'sent' : 'failed',
        sentAt: sendSuccess ? new Date() : null,
        error: sendSuccess ? null : JSON.stringify({ channel, messageLength: message.length }),
        retryCount: sendSuccess ? task.retryCount : task.retryCount + 1,
      },
    })

    // ── Persist message in conversation ──
    if (sendSuccess) {
      await db.message.create({
        data: {
          conversationId,
          content: message,
          direction: 'outbound',
          senderType: 'ai',
          type: 'text',
          metadata: JSON.stringify({ channel, taskId }),
          isAiGenerated: true,
          externalId: taskId,
        },
      })

      // Schedule the NEXT follow-up in the timeline
      const nextStep = step + 1
      const { FOLLOW_UP_TIMELINE } = await import('@/lib/ai/follow-up-engine')
      if (nextStep < FOLLOW_UP_TIMELINE.length) {
        await scheduleNextFollowUp(contactId, workspaceId, conversationId, nextStep).catch((err) => {
          logError('FOLLOWUP', 'next_schedule_failed', err, { taskId, nextStep })
        })
      }

      // Emit event
      eventBus.emit(EVENT_TYPES.FOLLOWUP_CREATED, {
        taskId,
        contactId,
        conversationId,
        ruleId: task.ruleId,
        scheduledAt: new Date().toISOString(),
        channel,
      }, 'worker:followups').catch(() => {})

      logOk('FOLLOWUP', 'sent', {
        taskId,
        contactId,
        channel,
        step,
        tipo,
      })
    }

    return { sent: sendSuccess, taskId }
  } catch (err) {
    // Mark task as failed so it can be retried
    await db.followUpTask.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        retryCount: task.retryCount + 1,
      },
    }).catch(() => {})

    throw err
  }
}

// ═══════════════════════════════════════════════════════════════
//  2. EVENT WORKER
// ═══════════════════════════════════════════════════════════════

async function processEventJob(job: Job<EventJobData>): Promise<{ eventId: string }> {
  const { eventType, payload, source, metadata } = job.data

  const eventId = await eventBus.emit(
    eventType,
    payload,
    source ?? 'queue:events',
    metadata,
  )

  logOk('EVENT_BUS', 'dispatched', { eventType, eventId })

  return { eventId }
}

// ═══════════════════════════════════════════════════════════════
//  3. AI TASK WORKER
// ═══════════════════════════════════════════════════════════════

async function processAITaskJob(job: Job<AITaskJobData>): Promise<Record<string, unknown>> {
  const { type, params } = job.data

  switch (type) {
    // ── Embedding Generation ──
    case 'embedding': {
      const { text, contactId, memoryKey } = params as {
        text: string
        contactId?: string
        memoryKey?: string
      }

      const { chatWithAI } = await import('@/lib/ai/providers')

      // Use AI to generate a compact semantic representation
      const result = await chatWithAI([
        {
          role: 'system',
          content: 'Genera UNA etiqueta corta (3-5 palabras) que capture el significado central del texto. Responde SOLO con la etiqueta, sin comillas ni explicaciones.',
        },
        { role: 'user', content: text.slice(0, 500) },
      ], 'glm', undefined, { temperature: 0.1, maxTokens: 30 })

      const embedding = result.content.trim()

      // Store if contact + key provided
      if (contactId && memoryKey) {
        await db.agentMemory.upsert({
          where: {
            agentId_contactId_key: {
              agentId: params.agentId as string || 'system',
              contactId,
              key: memoryKey,
            },
          },
          create: {
            agentId: params.agentId as string || 'system',
            contactId,
            key: memoryKey,
            value: text,
            source: 'system',
            confidence: 1.0,
          },
          update: {
            value: text,
            source: 'system',
          },
        }).catch(() => {})
      }

      return { type: 'embedding', embedding, contactId, memoryKey }
    }

    // ── Lead Scoring ──
    case 'lead_scoring': {
      const { contactId, workspaceId } = params as {
        contactId: string
        workspaceId: string
      }

      const contact = await db.contact.findUnique({
        where: { id: contactId },
        select: {
          leadScore: true,
          temperature: true,
          conversations: {
            where: { workspaceId },
            orderBy: { lastMessageAt: 'desc' },
            take: 1,
            include: {
              _count: { select: { messages: true } },
            },
          },
        },
      })

      if (!contact) {
        logWarn('AI', 'lead_scoring_contact_not_found', { contactId })
        return { type: 'lead_scoring', contactId, error: 'not_found' }
      }

      const conversation = contact.conversations[0]
      const messageCount = conversation?._count.messages ?? 0
      const baseScore = contact.leadScore

      // Simple scoring boost based on activity signals
      const activityScore = Math.min(30, messageCount * 3)
      const newScore = Math.min(100, baseScore + activityScore)
      const temperature = newScore >= 70 ? 'hot' : newScore >= 40 ? 'warm' : 'cold'

      await db.contact.update({
        where: { id: contactId },
        data: {
          leadScore: newScore,
          temperature,
          lastMessageAt: conversation?.lastMessageAt ?? undefined,
        },
      })

      return { type: 'lead_scoring', contactId, previousScore: baseScore, newScore, temperature }
    }

    // ── Batch Analysis ──
    case 'batch_analysis': {
      const { workspaceId, batchSize = 50 } = params as {
        workspaceId: string
        batchSize?: number
      }

      // Find contacts that haven't been analysed recently
      const contacts = await db.contact.findMany({
        where: {
          workspaceId,
          status: 'active',
          lastMessageAt: { not: null },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: batchSize,
        select: { id: true, firstName: true, leadScore: true },
      })

      logInfo('AI', 'batch_analysis_start', {
        workspaceId,
        contactCount: contacts.length,
      })

      // Score each contact
      const results: Array<{ contactId: string; score: number }> = []
      for (const contact of contacts) {
        // Queue individual scoring jobs for parallel processing
        results.push({ contactId: contact.id, score: contact.leadScore })
      }

      // Update temperature distribution stats
      const hot = contacts.filter((c) => c.leadScore >= 70).length
      const warm = contacts.filter((c) => c.leadScore >= 40 && c.leadScore < 70).length
      const cold = contacts.filter((c) => c.leadScore < 40).length

      return {
        type: 'batch_analysis',
        workspaceId,
        total: contacts.length,
        hot,
        warm,
        cold,
      }
    }

    // ── Context Summary ──
    case 'context_summary': {
      const { contactId, conversationId, workspaceId } = params as {
        contactId: string
        conversationId: string
        workspaceId: string
      }

      const { generateContextSummary } = await import('@/lib/ai/follow-up-engine')

      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { settings: true },
      })

      const wsSettings = (typeof workspace?.settings === 'string'
        ? JSON.parse(workspace.settings || '{}')
        : workspace?.settings) ?? {}

      const summary = await generateContextSummary(contactId, conversationId, wsSettings)

      return { type: 'context_summary', contactId, summary }
    }

    default: {
      logWarn('AI', 'unknown_task_type', { type })
      return { type, error: 'unknown_task_type' }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  4. SYNC WORKER
// ═══════════════════════════════════════════════════════════════

async function processSyncJob(job: Job<SyncJobData>): Promise<Record<string, unknown>> {
  const { type, workspaceId, userId, params } = job.data

  switch (type) {
    // ── Contact Import ──
    case 'contact_import': {
      const { rows, headers } = params as {
        rows: Record<string, unknown>[]
        headers: string[]
      }

      const { processImport } = await import('@/lib/import/import-agent')
      const result = await processImport(
        rows as any,
        headers,
        workspaceId,
      )

      logOk('CORE', 'import_completed', {
        workspaceId,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
      })

      // Notify via event bus
      eventBus.emit(EVENT_TYPES.AUTOMATION_TRIGGERED, {
        automationId: 'import',
        workspaceId,
        triggerType: 'import_complete',
        actions: [{ type: 'import', result }],
      }, 'worker:sync').catch(() => {})

      return {
        type: 'contact_import',
        workspaceId,
        ...result.analysis,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      }
    }

    // ── Calendar Sync ──
    case 'calendar_sync': {
      const { syncFrom, syncTo } = params as {
        syncFrom?: string
        syncTo?: string
      }

      logInfo('CORE', 'calendar_sync_start', {
        workspaceId,
        userId,
        syncFrom: syncFrom || 'now-7d',
        syncTo: syncTo || 'now+30d',
      })

      // Calendar sync placeholder — actual implementation would
      // use Google Calendar API via the google-oauth module
      const syncedEvents = 0

      logOk('CORE', 'calendar_sync_completed', {
        workspaceId,
        syncedEvents,
      })

      return {
        type: 'calendar_sync',
        workspaceId,
        syncedEvents,
      }
    }

    default: {
      logWarn('CORE', 'unknown_sync_type', { type })
      return { type, error: 'unknown_sync_type' }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  5. NOTIFICATION WORKER
// ═══════════════════════════════════════════════════════════════

async function processNotificationJob(
  job: Job<NotificationJobData>,
): Promise<{ delivered: boolean; channels: string[] }> {
  const { workspaceId, channels, type, title, body, contactName, to, metadata } = job.data

  const deliveredChannels: string[] = []
  const errors: string[] = []

  for (const channel of channels) {
    try {
      switch (channel) {
        // ── Email ──
        case 'email': {
          if (!to) {
            logWarn('SYSTEM', 'email_missing_recipient', { workspaceId, type })
            continue
          }
          const result = await sendEmail({
            to,
            subject: `[${title}] ValiAutoFlow`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <h2 style="margin:0 0 12px;color:#111827;">${title}</h2>
                ${contactName ? `<p style="color:#6b7280;margin:0 0 8px;">Contacto: <strong>${contactName}</strong></p>` : ''}
                <p style="font-size:15px;line-height:1.6;color:#374151;margin:16px 0;">${body.replace(/\n/g, '<br>')}</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <p style="font-size:12px;color:#9ca3af;">Enviado por ValiAutoFlow CRM</p>
              </div>
            `,
          })
          if (result.success) {
            deliveredChannels.push('email')
          } else {
            errors.push(`email: ${result.error}`)
          }
          break
        }

        // ── WhatsApp ──
        case 'whatsapp': {
          if (!to) {
            logWarn('SYSTEM', 'whatsapp_missing_recipient', { workspaceId, type })
            continue
          }
          if (!evolutionAPI.isEnabled()) {
            logWarn('SYSTEM', 'whatsapp_not_configured', { workspaceId })
            continue
          }
          const waMessage = `*${title}*\n\n${body}`
          const result = await evolutionAPI.sendMessage(to, waMessage)
          if (result.success) {
            deliveredChannels.push('whatsapp')
          } else {
            errors.push(`whatsapp: ${result.error}`)
          }
          break
        }

        // ── Telegram ──
        case 'telegram': {
          const result = await sendTelegramNotification({
            type: type as any,
            workspaceId,
            title,
            body,
            contactName: contactName || undefined,
            metadata: metadata as any,
          })
          if (result.success) {
            deliveredChannels.push('telegram')
          } else {
            errors.push(`telegram: ${result.error}`)
          }
          break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${channel}: ${msg}`)
      logError('SYSTEM', `${channel}_delivery_error`, err, { workspaceId, type })
    }
  }

  const allDelivered = deliveredChannels.length === channels.length

  if (!allDelivered) {
    logWarn('SYSTEM', 'partial_delivery', {
      workspaceId,
      type,
      delivered: deliveredChannels,
      errors,
    })
  } else {
    logOk('SYSTEM', 'delivered', {
      workspaceId,
      type,
      channels: deliveredChannels,
    })
  }

  return { delivered: allDelivered, channels: deliveredChannels }
}

// ═══════════════════════════════════════════════════════════════
//  WORKER LIFECYCLE — start / stop
// ═══════════════════════════════════════════════════════════════

let _workersStarted = false

/**
 * Start all workers.
 * Safe to call multiple times — no-ops after first call.
 *
 * Workers automatically begin polling their queues.
 */
export function startWorkers(): void {
  if (_workersStarted) {
    logInfo('SYSTEM', 'workers_already_running', {})
    return
  }

  _workersStarted = true
  logInfo('SYSTEM', 'starting_workers', {})

  // 1. Follow-ups — low concurrency (rate-limited by external APIs)
  followUpWorker = createWorker<FollowUpJobData>(
    QUEUE_NAMES.FOLLOWUPS,
    processFollowUpJob,
    { concurrency: 3 },
  )

  // 2. Events — high throughput (in-process, no external calls)
  eventWorker = createWorker<EventJobData>(
    QUEUE_NAMES.EVENTS,
    processEventJob,
    { concurrency: 10 },
  )

  // 3. AI tasks — moderate concurrency (API-rate-limited)
  aiWorker = createWorker<AITaskJobData>(
    QUEUE_NAMES.AI_TASKS,
    processAITaskJob,
    { concurrency: 3 },
  )

  // 4. Sync — low concurrency (long-running DB operations)
  syncWorker = createWorker<SyncJobData>(
    QUEUE_NAMES.SYNC,
    processSyncJob,
    { concurrency: 2 },
  )

  // 5. Notifications — moderate concurrency (external API calls)
  notificationWorker = createWorker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotificationJob,
    { concurrency: 5 },
  )

  logOk('SYSTEM', 'all_workers_started', {
    queues: Object.values(QUEUE_NAMES),
  })
}

/**
 * Gracefully stop all workers.
 * Closes the underlying Redis connections and waits for in-flight
 * jobs to complete (or times out).
 */
export async function stopWorkers(): Promise<void> {
  if (!_workersStarted) {
    logInfo('SYSTEM', 'workers_not_running', {})
    return
  }

  logInfo('SYSTEM', 'stopping_workers', {})

  const workers = [
    { name: 'followups', worker: followUpWorker },
    { name: 'events', worker: eventWorker },
    { name: 'ai-tasks', worker: aiWorker },
    { name: 'sync', worker: syncWorker },
    { name: 'notifications', worker: notificationWorker },
  ]

  // Close all workers in parallel
  await Promise.allSettled(
    workers.map(async ({ name, worker }) => {
      if (!worker) return
      try {
        await worker.close()
        logOk('SYSTEM', `worker_${name}_stopped`, {})
      } catch (err) {
        logError('SYSTEM', `worker_${name}_stop_error`, err)
      }
    }),
  )

  // Null out references
  followUpWorker = null
  eventWorker = null
  aiWorker = null
  syncWorker = null
  notificationWorker = null
  _workersStarted = false

  logOk('SYSTEM', 'all_workers_stopped', {})
}

/**
 * Check whether workers are currently running.
 */
export function isWorkersRunning(): boolean {
  return _workersStarted
}
