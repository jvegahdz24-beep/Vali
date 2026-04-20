// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Follow-Up Worker
// POST /api/followups/worker
// Cron-triggered worker that processes pending FollowUpTasks
// Auth: X-Worker-Key header
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { reactivationEngine } from '@/lib/ai/reactivation-engine'

// ─── Worker Key Authentication ──────────────────────────────

const WORKER_KEY = process.env.WORKER_KEY || 'valiflow-worker-2024'

function verifyWorkerKey(request: NextRequest): boolean {
  const key = request.headers.get('x-worker-key')
  return key === WORKER_KEY
}

// ─── Response Types ─────────────────────────────────────────

interface WorkerResult {
  success: boolean
  processed: number    // tasks evaluated
  sent: number         // successfully sent
  skipped: number      // skipped (no phone, no WhatsApp, cooldown, etc.)
  errors: number       // failed to send
  errorDetails: Array<{ taskId: string; contactId: string; error: string }>
  timestamp: string
  durationMs: number
}

// ─── POST Handler ───────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()

  // 1. Auth check
  if (!verifyWorkerKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'INVALID_WORKER_KEY' },
      { status: 401 }
    )
  }

  const result: WorkerResult = {
    success: true,
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    timestamp: new Date().toISOString(),
    durationMs: 0,
  }

  try {
    const now = new Date()
    console.log(`[FollowUp Worker] Starting at ${now.toISOString()}`)

    // 2. Fetch pending tasks whose scheduledAt <= now
    const pendingTasks = await db.followUpTask.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        // Note: FollowUpTask has no Prisma relations defined, so we query manually
        // We need workspace, contact, conversation, rule data
      },
    })

    console.log(`[FollowUp Worker] Found ${pendingTasks.length} pending tasks`)

    if (pendingTasks.length === 0) {
      result.processed = 0
      result.durationMs = Date.now() - startTime
      console.log('[FollowUp Worker] No pending tasks. Done.')
      return NextResponse.json(result)
    }

    result.processed = pendingTasks.length

    // 3. Process each task
    for (const task of pendingTasks) {
      try {
        // 3a. Get contact info (need phone number)
        const contact = await db.contact.findUnique({
          where: { id: task.contactId },
          select: { id: true, firstName: true, lastName: true, phone: true, status: true },
        })

        if (!contact) {
          console.log(`[FollowUp Worker] Task ${task.id}: contact ${task.contactId} not found, cancelling`)
          await db.followUpTask.update({
            where: { id: task.id },
            data: { status: 'cancelled', error: 'Contact not found' },
          })
          result.skipped++
          continue
        }

        if (!contact.phone) {
          console.log(`[FollowUp Worker] Task ${task.id}: contact ${contact.firstName} has no phone, cancelling`)
          await db.followUpTask.update({
            where: { id: task.id },
            data: { status: 'cancelled', error: 'Contact has no phone number' },
          })
          result.skipped++
          continue
        }

        // 3b. Check cooldown: look for tasks sent to this contact recently
        const cooldownHours = 24
        const cooldownCutoff = new Date(now.getTime() - cooldownHours * 60 * 60 * 1000)

        const recentSent = await db.followUpTask.count({
          where: {
            contactId: task.contactId,
            status: 'sent',
            sentAt: { gte: cooldownCutoff },
          },
        })

        if (recentSent > 0) {
          console.log(`[FollowUp Worker] Task ${task.id}: contact ${contact.firstName} already received follow-up within ${cooldownHours}h, skipping`)
          // Reschedule for after cooldown
          await db.followUpTask.update({
            where: { id: task.id },
            data: {
              scheduledAt: new Date(now.getTime() + cooldownHours * 60 * 60 * 1000),
            },
          })
          result.skipped++
          continue
        }

        // 3c. Get the follow-up rule to find message template
        let messageTemplate = ''

        if (task.ruleId === 'dib-reactivation') {
          // DIB reactivation — use ReactivationEngine to generate message
          try {
            const reactivationResults = await reactivationEngine.findAndReactivate(task.workspaceId)
            const matched = reactivationResults.find(r => r.contactId === task.contactId)
            messageTemplate = matched?.message || ''
          } catch {
            console.log(`[FollowUp Worker] DIB reactivation failed for task ${task.id}, using fallback`)
          }
        } else {
          // Standard FollowUpRule — get template from DB
          const rule = await db.followUpRule.findUnique({
            where: { id: task.ruleId },
            select: { messageTemplate: true, maxRetries: true, cooldownHours: true },
          })
          messageTemplate = rule?.messageTemplate || ''
        }

        // 3d. Personalize the template
        const personalizedMessage = messageTemplate
          .replace(/\{\{name\}\}/g, contact.firstName)
          .replace(/\{\{firstName\}\}/g, contact.firstName)
          .replace(/\{\{lastName\}\}/g, contact.lastName || '')

        if (!personalizedMessage) {
          console.log(`[FollowUp Worker] Task ${task.id}: empty message after personalization, skipping`)
          await db.followUpTask.update({
            where: { id: task.id },
            data: { status: 'cancelled', error: 'Empty message template' },
          })
          result.skipped++
          continue
        }

        // 3e. Send via WhatsApp
        const waConnected = whatsAppManager.isConnected()

        if (!waConnected) {
          console.log(`[FollowUp Worker] Task ${task.id}: WhatsApp not connected, marking as failed (retriable)`)
          await db.followUpTask.update({
            where: { id: task.id },
            data: {
              error: 'WhatsApp not connected',
              retryCount: { increment: 1 },
            },
          })
          result.skipped++
          continue
        }

        const sendResult = await whatsAppManager.sendMessage(contact.phone, personalizedMessage)

        if (sendResult.success) {
          // 3f. Mark as sent + log the message in conversation
          await db.followUpTask.update({
            where: { id: task.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
            },
          })

          // Log the message in the conversation
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
              metadata: JSON.stringify({
                source: 'followup-worker',
                taskId: task.id,
                ruleId: task.ruleId,
                automated: true,
              }),
            },
          })

          // Update conversation lastMessageAt
          await db.conversation.update({
            where: { id: task.conversationId },
            data: { lastMessageAt: new Date(), lastMessagePreview: personalizedMessage.slice(0, 100) },
          })

          // Update contact lastMessageAt
          await db.contact.update({
            where: { id: task.contactId },
            data: { lastMessageAt: new Date() },
          })

          // If DIB reactivation, update LeadProfile
          if (task.ruleId === 'dib-reactivation') {
            await db.leadProfile.updateMany({
              where: { contactId: task.contactId, workspaceId: task.workspaceId },
              data: {
                reactivateCount: { increment: 1 },
                lastReactivateAt: new Date(),
                reactivationCycle: { increment: 1 },
              },
            })
          }

          console.log(`[FollowUp Worker] Task ${task.id}: SENT to ${contact.firstName} (${contact.phone})`)
          result.sent++
        } else {
          // Send failed
          const errorMsg = sendResult.error || 'Unknown send error'
          console.log(`[FollowUp Worker] Task ${task.id}: FAILED to ${contact.firstName} — ${errorMsg}`)

          const newRetryCount = task.retryCount + 1
          const isMaxRetries = newRetryCount >= 3

          await db.followUpTask.update({
            where: { id: task.id },
            data: {
              status: isMaxRetries ? 'failed' : 'pending',
              error: errorMsg,
              retryCount: newRetryCount,
              // If not max retries, reschedule for 1 hour from now
              ...(isMaxRetries ? {} : { scheduledAt: new Date(now.getTime() + 60 * 60 * 1000) }),
            },
          })

          result.errors++
          result.errorDetails.push({
            taskId: task.id,
            contactId: task.contactId,
            error: errorMsg,
          })
        }
      } catch (taskError) {
        const errorMsg = taskError instanceof Error ? taskError.message : String(taskError)
        console.error(`[FollowUp Worker] Task ${task.id}: EXCEPTION — ${errorMsg}`)

        await db.followUpTask.update({
          where: { id: task.id },
          data: {
            error: errorMsg,
            retryCount: { increment: 1 },
          },
        }).catch(() => {
          // If even the DB update fails, just log and move on
          console.error(`[FollowUp Worker] Failed to update task ${task.id} after error`)
        })

        result.errors++
        result.errorDetails.push({
          taskId: task.id,
          contactId: task.contactId,
          error: errorMsg,
        })
      }
    }

    // 4. Return summary
    result.durationMs = Date.now() - startTime
    console.log(`[FollowUp Worker] Complete in ${result.durationMs}ms: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`)

    return NextResponse.json(result)

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[FollowUp Worker] Fatal error:', error)

    return NextResponse.json({
      success: false,
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 1,
      errorDetails: [{ taskId: 'system', contactId: 'system', error: errorMsg }],
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}

// ─── GET Handler (health/status check) ─────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyWorkerKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'INVALID_WORKER_KEY' },
      { status: 401 }
    )
  }

  try {
    const [pending, sent, failed, skipped] = await Promise.all([
      db.followUpTask.count({ where: { status: 'pending' } }),
      db.followUpTask.count({ where: { status: 'sent' } }),
      db.followUpTask.count({ where: { status: 'failed' } }),
      db.followUpTask.count({ where: { status: 'cancelled' } }),
    ])

    // Next scheduled task
    const nextTask = await db.followUpTask.findFirst({
      where: { status: 'pending' },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true },
    })

    return NextResponse.json({
      status: 'ok',
      queue: { pending, sent, failed, cancelled: skipped },
      total: pending + sent + failed + skipped,
      nextScheduledAt: nextTask?.scheduledAt || null,
      whatsappConnected: whatsAppManager.isConnected(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: String(error) },
      { status: 500 }
    )
  }
}
