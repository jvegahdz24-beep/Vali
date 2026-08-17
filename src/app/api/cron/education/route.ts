// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cron: Education Campaign Sequences
// GET /api/cron/education
// Processes due EducationExecution steps, sends messages via WhatsApp,
// then advances each execution to the next step (or marks complete).
// Called every 15 minutes by external cron.
// Auth: CRON_SECRET bearer or x-cron-secret header
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-cron-secret')
  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startMs = Date.now()
  const results = { processed: 0, sent: 0, advanced: 0, completed: 0, errors: 0 }

  try {
    const now = new Date()

    // Find executions due for their next step
    const dueExecutions = await db.educationExecution.findMany({
      where: { status: 'active', nextStepAt: { lte: now } },
      include: {
        campaign: {
          include: {
            steps: { orderBy: { stepNumber: 'asc' } },
          },
        },
      },
      take: 100, // safety cap per run
    })

    console.log(`[Education Cron] Found ${dueExecutions.length} due executions`)
    results.processed = dueExecutions.length

    for (const execution of dueExecutions) {
      try {
        const steps = execution.campaign.steps
        const currentStep = steps.find(s => s.stepNumber === execution.currentStep)

        if (!currentStep) {
          // No more steps → mark complete
          await db.educationExecution.update({
            where: { id: execution.id },
            data: { status: 'completed', completedAt: now },
          })
          results.completed++
          continue
        }

        // Get contact phone
        const contact = await db.contact.findUnique({
          where: { id: execution.contactId },
          select: { phone: true, firstName: true, lastName: true },
        })

        if (!contact?.phone) {
          await db.educationExecution.update({
            where: { id: execution.id },
            data: { status: 'cancelled' },
          })
          results.errors++
          continue
        }

        // Build message content
        let messageToSend = currentStep.content
          .replace(/\{\{name\}\}/g, contact.firstName)
          .replace(/\{\{firstName\}\}/g, contact.firstName)
          .replace(/\{\{lastName\}\}/g, contact.lastName || '')

        // Append media URL if step has an asset
        if (currentStep.assetId) {
          try {
            const asset = await db.mediaAsset.findUnique({
              where: { id: currentStep.assetId },
              select: { url: true, name: true },
            })
            if (asset?.url) {
              messageToSend += `\n\n${asset.url}`
            }
          } catch { /* non-critical */ }
        }

        // Send via WhatsApp
        const manager = getWhatsAppManager(execution.workspaceId)
        let sent = false

        if (manager.isConnected()) {
          const sendResult = await manager.sendMessage(contact.phone, messageToSend)
          sent = sendResult.success
        }

        if (sent) results.sent++
        else results.errors++

        // Determine next step
        const nextStepDef = steps.find(s => s.stepNumber === execution.currentStep + 1)

        if (nextStepDef) {
          const nextStepAt = new Date(now.getTime() + nextStepDef.delayMinutes * 60 * 1000)
          await db.educationExecution.update({
            where: { id: execution.id },
            data: {
              currentStep: nextStepDef.stepNumber,
              nextStepAt,
            },
          })
          results.advanced++
        } else {
          // Last step was just sent → complete
          await db.educationExecution.update({
            where: { id: execution.id },
            data: { status: 'completed', completedAt: now },
          })
          results.completed++
        }
      } catch (execErr) {
        console.error(`[Education Cron] Execution ${execution.id} failed:`, execErr instanceof Error ? execErr.message : execErr)
        results.errors++
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      durationMs: Date.now() - startMs,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('[Education Cron] Fatal error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error', durationMs: Date.now() - startMs },
      { status: 500 },
    )
  }
}
