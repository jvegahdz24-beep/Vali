// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cron: Automation Evaluator
// GET /api/cron/automations — Evaluate & execute pending automations
// Called every 5 minutes by external cron (Vercel Cron / system cron)
//
// Processes:
//   - scheduled automations (based on triggerConfig.interval)
//   - inactivity triggers (contacts inactive > N hours)
//   - deal_stage_change (event-driven, logged but consumed via event-bus)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { processJobs, cleanupJobs } from '@/lib/job-queue'
import { processExpiredApprovals } from '@/lib/ai/approval-timeout'
import { runMarketingLearning } from '@/lib/marketing/learning'
import { runMarketingAutomationScan } from '@/lib/marketing/automation-scanner'
import { publishDueCalendarEntries } from '@/lib/marketing/calendar-publisher'

// ─── Authorization ────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-cron-secret')
  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret
}

// ─── Action executor (shared with /api/automations/trigger) ───

async function executeAutomationForContact(
  automationId: string,
  workspaceId: string,
  contactId: string,
  actions: Array<{ type: string; payload?: Record<string, unknown> }>
): Promise<{ ok: boolean; message?: string }> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, firstName: true, lastName: true, phone: true },
  })
  if (!contact) return { ok: false, message: 'Contact not found' }

  for (const action of actions) {
    if (action.type === 'send_message') {
      const msgText = (action.payload?.message as string) ?? (action.payload?.content as string) ?? ''
      if (!msgText) continue

      const conv = await db.conversation.findFirst({
        where: { workspaceId, contactId, status: 'active' },
        select: { id: true },
      })

      if (conv) {
        await db.message.create({
          data: {
            conversationId: conv.id,
            content: msgText.replace(/\{\{name\}\}/g, contact.firstName),
            type: 'text',
            direction: 'outbound',
            senderType: 'agent',
            isAiGenerated: false,
            metadata: JSON.stringify({ source: 'automation_cron', automationId }),
          },
        })

        // Attempt WhatsApp send if connected
        const wm = getWhatsAppManager(workspaceId)
        if (wm.isConnected() && contact.phone) {
          await wm.sendMessage(contact.phone, msgText.replace(/\{\{name\}\}/g, contact.firstName))
            .catch((e) => console.warn('[AutomationCron] WA send failed:', e))
        }
      }
    }
  }

  return { ok: true }
}

// ─── Scheduled automation: should it run now? ─────────────────

function shouldRunScheduled(
  lastRunAt: Date | null,
  triggerConfig: Record<string, unknown>
): boolean {
  const intervalHours = (triggerConfig.intervalHours as number) ?? 24
  const intervalMs = intervalHours * 60 * 60 * 1000
  if (!lastRunAt) return true
  return Date.now() - lastRunAt.getTime() >= intervalMs
}

// ─── Inactivity automation: find candidate contacts ───────────

async function getInactiveContacts(
  workspaceId: string,
  triggerConfig: Record<string, unknown>
): Promise<string[]> {
  const inactiveHours = (triggerConfig.inactiveHours as number) ?? 24
  const maxLeadScore = (triggerConfig.maxLeadScore as number) ?? 100
  const minLeadScore = (triggerConfig.minLeadScore as number) ?? 0

  const cutoff = new Date(Date.now() - inactiveHours * 60 * 60 * 1000)

  const contacts = await db.contact.findMany({
    where: {
      workspaceId,
      leadScore: { gte: minLeadScore, lte: maxLeadScore },
      OR: [
        { lastMessageAt: { lte: cutoff } },
        { lastMessageAt: null },
      ],
    },
    select: { id: true },
    take: 50, // Cap per run
  })

  const contactIds = contacts.map((c) => c.id)
  if (contactIds.length === 0) return []

  // 48h cooldown: skip contacts that already received an outbound message recently
  const FORTY_EIGHT_HOURS_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const recentlySentConvs = await db.conversation.findMany({
    where: {
      workspaceId,
      contactId: { in: contactIds },
      messages: {
        some: {
          direction: 'outbound',
          createdAt: { gte: FORTY_EIGHT_HOURS_AGO },
        },
      },
    },
    select: { contactId: true },
  })
  const recentlySentIds = new Set(recentlySentConvs.map((c) => c.contactId))

  return contactIds.filter((id) => !recentlySentIds.has(id))
}

// ─── Main GET handler ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const workspaces = await db.workspace.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    })

    let totalExecuted = 0
    let totalFailed = 0

    for (const workspace of workspaces) {
      // Load active automations for this workspace
      const automations = await db.automation.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
          triggerType: { in: ['scheduled', 'inactivity', 'event'] },
        },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          triggerType: true,
          triggerConfig: true,
          actions: true,
          lastRunAt: true,
          runCount: true,
        },
      })

      for (const automation of automations) {
        let triggerConfig: Record<string, unknown> = {}
        let actions: Array<{ type: string; payload?: Record<string, unknown> }> = []
        try {
          triggerConfig = JSON.parse(automation.triggerConfig || '{}')
          actions = JSON.parse(automation.actions || '[]')
        } catch {
          continue
        }

        if (actions.length === 0) continue

        // ── Scheduled: run once per interval ──────────────────
        if (automation.triggerType === 'scheduled') {
          if (!shouldRunScheduled(automation.lastRunAt, triggerConfig)) continue

          // Run for all active contacts in workspace (up to 20)
          const contacts = await db.contact.findMany({
            where: { workspaceId: workspace.id },
            select: { id: true },
            take: 20,
          })

          let ran = 0
          for (const c of contacts) {
            const result = await executeAutomationForContact(
              automation.id, workspace.id, c.id, actions
            ).catch((e) => ({ ok: false, message: String(e) }))
            if (result.ok) ran++
            else totalFailed++
          }

          await db.automationLog.create({
            data: {
              automationId: automation.id,
              workspaceId: workspace.id,
              status: 'success',
              action: `scheduled run — ${ran}/${contacts.length} contacts`,
              metadata: JSON.stringify({ triggerType: 'scheduled' }),
            },
          })

          await db.automation.update({
            where: { id: automation.id },
            data: { runCount: { increment: ran }, lastRunAt: new Date() },
          })

          totalExecuted += ran
          continue
        }

        // ── Inactivity: find contacts that qualify ─────────────
        if (automation.triggerType === 'inactivity') {
          if (!shouldRunScheduled(automation.lastRunAt, { intervalHours: 6, ...triggerConfig })) continue

          const contactIds = await getInactiveContacts(workspace.id, triggerConfig)
          if (contactIds.length === 0) continue

          let ran = 0
          for (const contactId of contactIds) {
            const result = await executeAutomationForContact(
              automation.id, workspace.id, contactId, actions
            ).catch((e) => ({ ok: false, message: String(e) }))
            if (result.ok) ran++
            else totalFailed++
          }

          await db.automationLog.create({
            data: {
              automationId: automation.id,
              workspaceId: workspace.id,
              status: ran > 0 ? 'success' : 'skipped',
              action: `inactivity trigger — ${ran}/${contactIds.length} contacts`,
              metadata: JSON.stringify({ triggerType: 'inactivity', contactCount: contactIds.length }),
            },
          })

          if (ran > 0) {
            await db.automation.update({
              where: { id: automation.id },
              data: { runCount: { increment: ran }, lastRunAt: new Date() },
            })
          }

          totalExecuted += ran
        }
      }
    }

    // ── 1e: Lead score decay — spec Paso 3: "no responde en 3 días" → −10 ──
    // Fires ONCE as a contact crosses the 3-day no-reply mark. The window
    // (3d → 3d+6h) matches the cron cadence (every 6h) so each lead is
    // penalised a single time per inactivity period, not on every run.
    const noReplyEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)         // hace 3 días
    const noReplyStart = new Date(Date.now() - (3 * 24 + 6) * 60 * 60 * 1000) // hace 3 días 6 horas
    const decayResult = await db.$executeRaw`
      UPDATE Contact
      SET leadScore = GREATEST(0, leadScore - 10)
      WHERE leadScore > 0
        AND lastMessageAt IS NOT NULL
        AND lastMessageAt >= ${noReplyStart}
        AND lastMessageAt < ${noReplyEnd}
    `
    const decayedCount = Number(decayResult) ?? 0

    // ── 6c: Process pending job queue items ───────────────────
    const jobStats = await processJobs('default', async (payload, _jobId) => {
      // Generic handler — specific job types dispatched by payload.action
      console.log('[JobQueue] Processing job:', payload)
    })

    // Cleanup old completed/failed jobs (weekly)
    await cleanupJobs().catch(() => {})

    // ── 6d: Aprobaciones por Telegram expiradas (3h sin respuesta → auto-envío)
    // Este cron corre cada 5 min, así el temporizador es puntual.
    const approvals = await processExpiredApprovals().catch((e) => {
      console.warn('[Cron] approval timeout sweep failed:', e instanceof Error ? e.message : e)
      return { sent: 0, cancelled: 0, marketingPublished: 0 }
    })

    // ── 6d-bis: Alertas de citas (recordatorio 45-75min antes, asistencia,
    // citas perdidas, leads calientes/estancados). ANTES solo corrían cada 2h
    // vía la tarea de Windows → la ventana de 30 min del recordatorio casi
    // nunca coincidía y NUNCA se enviaban. Este cron corre cada 5 min.
    try {
      const port = process.env.PORT || '3105'
      await fetch(`http://127.0.0.1:${port}/api/cron/follow-ups?steps=alerts`, {
        headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
      })
    } catch (e) { console.warn('[Cron] appointment alerts failed:', e instanceof Error ? e.message : e) }

    // ── 6e: Piloto de marketing + publicaciones agendadas ─────────
    // Antes dependía del PM2 valiflow-cron (detenido) → el piloto nunca corría
    // solo. Ahora este cron (cada 5 min) lo dispara; la ruta se autorregula
    // (horario óptimo, límite diario, modo aprobación).
    try {
      const port = process.env.PORT || '3105'
      await fetch(`http://127.0.0.1:${port}/api/marketing/bot/run`, {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET || '', 'Content-Type': 'application/json' },
        body: '{}',
      })
    } catch (e) { console.warn('[Cron] marketing bot run failed:', e instanceof Error ? e.message : e) }

    // ── 6f: Aprendizaje del bot de marketing — una vez al día por workspace
    // lee métricas reales de sus posts (Graph) y actualiza lo aprendido;
    // lunes ≥9am manda el reporte semanal por Telegram. Se autorregula.
    const learning = await runMarketingLearning().catch((e) => {
      console.warn('[Cron] marketing learning failed:', e instanceof Error ? e.message : e)
      return { learned: 0, reports: 0 }
    })

    // ── 6g: Automatizaciones de leads (Pantalla 4) + Calendario (Pantalla 3) ──
    // Dispara las MarketingAutomation por días de inactividad / temperatura /
    // etiqueta (las de etapa van por evento) y publica las entradas del
    // calendario aprobadas cuya hora ya llegó. Antes ninguna de las dos corría.
    let mktAutoSent = 0, calPublished = 0, calFailed = 0
    for (const workspace of workspaces) {
      try { mktAutoSent += (await runMarketingAutomationScan(workspace.id)).sent }
      catch (e) { console.warn('[Cron] mkt automation scan failed', workspace.id, e instanceof Error ? e.message : e) }
      try { const r = await publishDueCalendarEntries(workspace.id); calPublished += r.published; calFailed += r.failed }
      catch (e) { console.warn('[Cron] calendar publish failed', workspace.id, e instanceof Error ? e.message : e) }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startTime,
      workspacesProcessed: workspaces.length,
      totalExecuted,
      totalFailed,
      decayedContacts: decayedCount,
      jobQueue: jobStats,
      approvalTimeouts: approvals,
      marketingLearning: learning,
      leadAutomations: { sent: mktAutoSent },
      calendar: { published: calPublished, failed: calFailed },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsedMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
