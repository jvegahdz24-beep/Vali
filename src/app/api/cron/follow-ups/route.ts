// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cron: Follow-ups & DIB Reactivation
// GET /api/cron/follow-ups — Process due follow-up tasks + DIB reactivation
// GET /api/cron/follow-ups/test — Dry-run test mode
// Called every 2 hours by external cron (Vercel Cron / system cron)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { runReactivationCycle } from '@/lib/ai/reactivation-engine'

// ─── Cron Security ────────────────────────────────────────────
// In production, validate via CRON_SECRET header or bearer token

function isAuthorized(req: NextRequest): boolean {
  // In sandbox/dev: allow all
  if (process.env.NODE_ENV !== 'production') return true

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // No secret configured = open

  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-cron-secret')

  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret
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

  // Load rules separately to avoid type issues
  const ruleIds = [...new Set(pendingTasks.map(t => t.ruleId))]
  const rules = await db.followUpRule.findMany({
    where: { id: { in: ruleIds } },
  })
  const ruleMap = new Map(rules.map(r => [r.id, r]))

  let processed = 0
  let sent = 0
  let failed = 0

  for (const task of pendingTasks) {
    try {
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
        break
      }

      // Send message
      const rule = ruleMap.get(task.ruleId)
      const template = (rule as any)?.messageTemplate || 'Hola, ¿cómo estás? Seguimos disponibles para ayudarte.'
      const message = template.replace(/\{\{name\}\}/g, contact.firstName)

      const result = await whatsAppManager.sendMessage(contact.phone, message)

      // Update task status
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
