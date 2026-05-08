// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Follow-Up Worker
// POST /api/followups/worker
// Cron-triggered worker that processes pending FollowUpTasks
// Auth: X-Worker-Key header
// Supports both persistent (whatsAppManager) and ephemeral connections
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { reactivationEngine } from '@/lib/ai/reactivation-engine'

const WORKER_KEY = process.env.WORKER_KEY || ''

// FIX M9: Timing-safe worker key comparison
function verifyWorkerKey(request: NextRequest): boolean {
  const incoming = request.headers.get('x-worker-key')
  if (!incoming) return false
  const a = Buffer.from(WORKER_KEY)
  const b = Buffer.from(incoming)
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) { result |= a[i] ^ b[i] }
  return result === 0
}

interface WorkerResult {
  success: boolean
  processed: number
  sent: number
  skipped: number
  errors: number
  errorDetails: Array<{ taskId: string; contactId: string; error: string }>
  timestamp: string
  durationMs: number
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()

  if (!verifyWorkerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_WORKER_KEY' }, { status: 401 })
  }

  const result: WorkerResult = {
    success: true, processed: 0, sent: 0, skipped: 0, errors: 0,
    errorDetails: [], timestamp: new Date().toISOString(), durationMs: 0,
  }

  try {
    const now = new Date()
    console.log(`[FollowUp Worker] Starting at ${now.toISOString()}`)

    const pendingTasks = await db.followUpTask.findMany({
      where: { status: 'pending', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
    })

    console.log(`[FollowUp Worker] Found ${pendingTasks.length} pending tasks`)

    if (pendingTasks.length === 0) {
      result.durationMs = Date.now() - startTime
      return NextResponse.json(result)
    }

    result.processed = pendingTasks.length

    for (const task of pendingTasks) {
      try {
        const contact = await db.contact.findUnique({
          where: { id: task.contactId },
          select: { id: true, firstName: true, lastName: true, phone: true, status: true },
        })

        if (!contact) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'Contact not found' } })
          result.skipped++
          continue
        }

        if (!contact.phone) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'No phone' } })
          result.skipped++
          continue
        }

        // Check cooldown (24h)
        const cooldownCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const recentSent = await db.followUpTask.count({
          where: { contactId: task.contactId, status: 'sent', sentAt: { gte: cooldownCutoff } },
        })
        if (recentSent > 0) {
          await db.followUpTask.update({ where: { id: task.id }, data: { scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } })
          result.skipped++
          continue
        }

        // Get message template
        let messageTemplate = ''
        if (task.ruleId === 'dib-reactivation') {
          try {
            const results = await reactivationEngine.findAndReactivate(task.workspaceId)
            messageTemplate = results.find(r => r.contactId === task.contactId)?.message || ''
          } catch { /* fallback */ }
        } else {
          const rule = await db.followUpRule.findUnique({ where: { id: task.ruleId }, select: { messageTemplate: true } })
          messageTemplate = rule?.messageTemplate || ''
        }

        const personalizedMessage = messageTemplate
          .replace(/\{\{name\}\}/g, contact.firstName)
          .replace(/\{\{firstName\}\}/g, contact.firstName)
          .replace(/\{\{lastName\}\}/g, contact.lastName || '')

        if (!personalizedMessage) {
          await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'Empty template' } })
          result.skipped++
          continue
        }

        // Send: try persistent → ephemeral fallback
        let sendResult: { success: boolean; id?: string; error?: string }
        let sendSource = 'none'

        if (whatsAppManager.isConnected()) {
          sendResult = await whatsAppManager.sendMessage(contact.phone, personalizedMessage)
          sendSource = 'persistent'
        } else {
          const eph = await ephemeralManager.sendAny(contact.phone, personalizedMessage, (p, t) => whatsAppManager.sendMessage(p, t))
          sendResult = eph
          sendSource = eph.source || 'none'
        }

        if (!sendResult.success) {
          await db.followUpTask.update({ where: { id: task.id }, data: { error: 'WhatsApp not connected', retryCount: { increment: 1 } } })
          result.skipped++
          continue
        }

        // Mark as sent
        await db.followUpTask.update({ where: { id: task.id }, data: { status: 'sent', sentAt: new Date() } })

        await db.message.create({
          data: {
            conversationId: task.conversationId,
            content: personalizedMessage,
            type: 'text',
            direction: 'outbound',
            senderType: 'agent',
            senderId: task.ruleId === 'dib-reactivation' ? 'dib-reactivation' : 'followup-worker',
            isAiGenerated: task.ruleId === 'dib-reactivation',
            status: 'sent',
            externalId: sendResult.id,
            metadata: JSON.stringify({ source: 'followup-worker', taskId: task.id, ruleId: task.ruleId, sendSource, automated: true }),
          },
        })

        await db.conversation.update({
          where: { id: task.conversationId },
          data: { lastMessageAt: new Date(), lastMessagePreview: personalizedMessage.slice(0, 100) },
        })
        await db.contact.update({ where: { id: task.contactId }, data: { lastMessageAt: new Date() } })

        if (task.ruleId === 'dib-reactivation') {
          await db.leadProfile.updateMany({
            where: { contactId: task.contactId, workspaceId: task.workspaceId },
            data: { reactivateCount: { increment: 1 }, lastReactivateAt: new Date(), reactivationCycle: { increment: 1 } },
          })
        }

        console.log(`[FollowUp Worker] Task ${task.id}: SENT via ${sendSource} to ${contact.firstName}`)
        result.sent++

      } catch (taskError) {
        const errorMsg = taskError instanceof Error ? taskError.message : String(taskError)
        console.error(`[FollowUp Worker] Task ${task.id}: EXCEPTION — ${errorMsg}`)
        await db.followUpTask.update({ where: { id: task.id }, data: { error: errorMsg, retryCount: { increment: 1 } } }).catch(() => {})
        result.errors++
        result.errorDetails.push({ taskId: task.id, contactId: task.contactId, error: errorMsg })
      }
    }

    result.durationMs = Date.now() - startTime
    console.log(`[FollowUp Worker] Complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors (${result.durationMs}ms)`)
    return NextResponse.json(result)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[FollowUp Worker] Fatal error:', error)
    return NextResponse.json({
      success: false, processed: 0, sent: 0, skipped: 0, errors: 1,
      errorDetails: [{ taskId: 'system', contactId: 'system', error: errorMsg }],
      timestamp: new Date().toISOString(), durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyWorkerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_WORKER_KEY' }, { status: 401 })
  }

  try {
    const [pending, sent, failed, skipped] = await Promise.all([
      db.followUpTask.count({ where: { status: 'pending' } }),
      db.followUpTask.count({ where: { status: 'sent' } }),
      db.followUpTask.count({ where: { status: 'failed' } }),
      db.followUpTask.count({ where: { status: 'cancelled' } }),
    ])
    const nextTask = await db.followUpTask.findFirst({ where: { status: 'pending' }, orderBy: { scheduledAt: 'asc' }, select: { scheduledAt: true } })

    return NextResponse.json({
      status: 'ok',
      queue: { pending, sent, failed, cancelled: skipped },
      total: pending + sent + failed + skipped,
      nextScheduledAt: nextTask?.scheduledAt || null,
      whatsappConnected: whatsAppManager.isConnected() || !!ephemeralManager.getConnected(),
      ephemeralSessions: ephemeralManager.list().length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 500 })
  }
}
