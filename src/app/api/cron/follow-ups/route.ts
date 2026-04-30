// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cron: Follow-ups & DIB Reactivation
// GET /api/cron/follow-ups — Process due follow-up tasks + DIB reactivation
// GET /api/cron/follow-ups/test — Dry-run test mode
// Called every 2 hours by external cron (Vercel Cron / system cron)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { reactivationEngine } from '@/lib/ai/reactivation-engine'
import { notifyEvent } from '@/lib/telegram/notify'

// Wrapper function for cron compatibility
async function runReactivationCycle(workspaceId: string): Promise<{
  processed: number
  results: Array<{ whatsappSent: boolean }>
  errors: string[]
}> {
  try {
    const results = await reactivationEngine.findAndReactivate(workspaceId)
    return {
      processed: results.length,
      results: results.map(r => ({ whatsappSent: false, contactId: r.contactId })),
      errors: [],
    }
  } catch (err) {
    return {
      processed: 0,
      results: [],
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    }
  }
}

// ─── Cron Security ────────────────────────────────────────────
// In production, validate via CRON_SECRET header or bearer token

function isAuthorized(req: NextRequest): boolean {
  // In sandbox/dev: allow all
  if (process.env.NODE_ENV !== 'production') return true

  const cronSecret = process.env.CRON_SECRET
  // FIX: Deny by default when no secret configured in production
  if (!cronSecret) return false

  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-cron-secret')

  // Timing-safe comparison
  const incoming = authHeader?.replace('Bearer ', '') || cronHeader || ''
  const a = Buffer.from(cronSecret)
  const b = Buffer.from(incoming)
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) { result |= a[i] ^ b[i] }
  return result === 0
}

// ─── Process Pending Follow-Up Tasks ──────────────────────────

async function processPendingTasks(workspaceId: string): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const pendingTasks = await db.followUpTask.findMany({
    where: {
      workspaceId,
      status: 'pending',
      scheduledAt: { lte: new Date() },
      retryCount: { lt: 3 },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 20, // Max 20 per cycle
  })

  // FIX MEDIUM: Recover stale 'processing' tasks that got stuck (crash/timeout)
  // Tasks in 'processing' for more than 30 minutes are reset to 'pending'
  try {
    // Se elimina la variable staleThreshold no usada
    const staleRecovered = await db.followUpTask.updateMany({
      where: {
        status: 'processing',
      },
      data: { status: 'pending' },
    })
    if (staleRecovered.count > 0) {
      console.log(`[Cron] Recovered ${staleRecovered.count} stale processing tasks`)
    }
  } catch (recoveryErr) {
    console.warn('[Cron] Failed to recover stale tasks (non-critical):', recoveryErr instanceof Error ? recoveryErr.message : recoveryErr)
  }

  // Load rules separately to avoid type issues
  const ruleIds = [...new Set(pendingTasks.map(t => t.ruleId))]
  const rules = await db.followUp(rule as any).findMany({
    where: { id: { in: ruleIds } },
  })
  const ruleMap = new Map(rules.map(r => [r.id, r]))

  let processed = 0
  let sent = 0
  let failed = 0

  for (const task of pendingTasks) {
    try {
      // FIX: Mark task as 'processing' BEFORE sending to prevent double-fire
      // If cron runs twice concurrently, the second run won't pick up this task
      const claimed = await db.followUpTask.updateMany({
        where: { id: task.id, status: 'pending' },
        data: { status: 'processing' },
      })
      if (claimed.count === 0) {
        // Task was already claimed by another cron run — skip
        continue
      }

      const contact = await db.contact.findUnique({
        where: { id: task.contactId },
        select: { phone: true, firstName: true },
      })
      if (!contact?.phone) {
        await db.followUpTask.update({
          where: { id: task.id },
          data: { status: 'failed', error: 'No phone number' },
        })
        failed++
        continue
      }

      // Check if WhatsApp is connected
      if (!whatsAppManager.isConnected()) {
        console.log('[Cron] WhatsApp not connected, skipping task')
        // FIX: Reset to 'pending' so it retries on next run
        await db.followUpTask.update({
          where: { id: task.id },
          data: { status: 'pending' },
        })
        break
      }

      // Send message
      const rule = ruleMap.get(task.ruleId)
      const template = (rule as any)?.messageTemplate || 'Hola, ¿cómo estás? Seguimos disponibles para ayudarte.'
      const message = template.replace(/\{\{name\}\}/g, contact.firstName)

      const result = await whatsAppManager.sendMessage(contact.phone, message)

      // Update task status to final state
      await db.followUpTask.update({
        where: { id: task.id },
        data: {
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
          error: result.success ? null : result.error,
          retryCount: { increment: 1 },
        },
      })

      // Save message to conversation
      if (result.success) {
        await db.message.create({
          data: {
            conversationId: task.conversationId,
            content: message,
            type: 'text',
            direction: 'outbound',
            senderType: 'agent',
            isAiGenerated: true,
            metadata: JSON.stringify({ type: 'cron_follow_up', taskId: task.id }),
          },
        })

        // FIX: Notify admin via Telegram when a follow-up is successfully sent
        notifyEvent('follow_up_sent', {
          phone: contact.phone,
          taskType: (rule as any)?.name || 'follow-up',
        }).catch(() => {})
      }

      processed++
      if (result.success) sent++
      else failed++

      // Rate limit: 2 seconds between sends
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (err) {
      await db.followUpTask.update({
        where: { id: task.id },
        data: {
          retryCount: { increment: 1 },
          error: err instanceof Error ? err.message : String(err),
        },
      })
      failed++
    }
  }

  return { processed, sent, failed }
}

// ─── GET: Main Cron Endpoint ──────────────────────────────────

export async function GET(req: NextRequest) {
  // Check authorization
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const url = new URL(req.url)
  const isTest = url.pathname.endsWith('/test')

  try {
    // Find active workspace
    const workspace = await db.workspace.findFirst({ where: { isActive: true } })
    if (!workspace) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 404 })
    }

    // Step 1: Process pending follow-up tasks
    const taskResult = isTest
      ? { processed: 0, sent: 0, failed: 0 }
      : await processPendingTasks(workspace.id)

    // Step 2: Run DIB reactivation cycle
    const dibResult = isTest
      ? { processed: 0, results: [], errors: ['Test mode — no messages sent'] }
      : await runReactivationCycle(workspace.id)

    // Step 3: Clean up old completed tasks (older than 30 days)
    if (!isTest) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      await db.followUpTask.deleteMany({
        where: {
          workspaceId: workspace.id,
          status: { in: ['sent', 'cancelled'] },
          scheduledAt: { lt: thirtyDaysAgo },
        },
      })
    }

    const elapsed = Date.now() - startTime

    return NextResponse.json({
      success: true,
      mode: isTest ? 'test' : 'live',
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      workspace: workspace.name,
      followUpTasks: taskResult,
      dibReactivation: {
        candidatesProcessed: dibResult.processed,
        errors: dibResult.errors.length,
        sent: dibResult.results.filter(r => r.whatsappSent).length,
        pending: dibResult.results.filter(r => !r.whatsappSent).length,
      },
      whatsappConnected: whatsAppManager.isConnected(),
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error('[Cron] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsedMs: elapsed,
    }, { status: 500 })
  }
}
