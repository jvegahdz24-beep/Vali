// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cron: Follow-ups & DIB Reactivation
// GET /api/cron/follow-ups — Process due follow-up tasks + DIB reactivation
// GET /api/cron/follow-ups/test — Dry-run test mode
// Called every 2 hours by external cron (Vercel Cron / system cron)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getWhatsAppManager, whatsAppRegistry } from '@/lib/whatsapp/connection'
import { reactivationEngine } from '@/lib/ai/reactivation-engine'
import { evaluateInactivityRules } from '@/lib/ai/inactivity-rules'
import { shouldStopFollowUps, cancelPendingFollowUps, markDisinterested } from '@/lib/ai/follow-up-guard'
import { processExpiredApprovals } from '@/lib/ai/approval-timeout'
import { resetFollowUpTimeline, scheduleNextFollowUp, generateFollowUpMessage, type FollowUpTipo } from '@/lib/ai/follow-up-engine'
import { broadcastToWorkspace } from '@/lib/telegram'
import { notifyStaleLead, notifyAttendanceCheck, notifyFollowUpApproval } from '@/lib/telegram-events'
import { getWorkspaceTimezone } from '@/lib/timezone'
import { sendToLead } from '@/lib/marketing/lead-channel'

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
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET no configurado — acceso denegado')
    return false
  }

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
  // Permanent delegation: /api/followups/worker is the sole follow-up
  // consumer. This guard remains explicit so future callers cannot silently
  // reintroduce a second sender in the cron path.
  return { processed: 0, sent: 0, failed: 0 }

}

// ─── Appointment Reminder (1h before) ────────────────────────

async function processAppointmentReminders(workspaceId: string): Promise<{ sent: number }> {
  // Respeta el toggle "Recordatorio de cita" del Calendario (settings.reminders.appointment).
  try {
    const wsRow = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const s = JSON.parse(wsRow?.settings || '{}')
    if (s?.reminders?.appointment === false) return { sent: 0 }
  } catch { /* si falla, sigue con el comportamiento por defecto */ }

  const now = new Date()
  const windowStart = new Date(now.getTime() + 45 * 60 * 1000)  // 45 min from now
  const windowEnd   = new Date(now.getTime() + 75 * 60 * 1000)  // 75 min from now

  const upcoming = await db.appointment.findMany({
    where: {
      workspaceId,
      status: 'pending',
      date: { gte: windowStart, lte: windowEnd },
      contactId: { not: null },
    },
    include: { contact: { select: { id: true, phone: true, firstName: true } } },
  })

  let sent = 0
  for (const appt of upcoming) {
    if (!appt.contact?.phone || !appt.contactId) continue

    // Dedup: skip if reminder already sent for this appointment
    const alreadySent = await db.engineEvent.findFirst({
      where: {
        workspaceId,
        contactId: appt.contactId,
        type: 'APPOINTMENT_REMINDER_SENT',
        metadata: { contains: appt.id },
      },
    })
    if (alreadySent) continue

    const manager = getWhatsAppManager(workspaceId)
    if (!manager.isConnected()) break

    const name = appt.contact.firstName || 'cliente'
    const apptTz = await getWorkspaceTimezone(workspaceId)
    const timeStr = appt.date.toLocaleTimeString('es-MX', { timeZone: apptTz, hour: '2-digit', minute: '2-digit' })
    const message = `Hola ${name} 👋 Te recordamos que tienes una cita con nosotros en menos de 1 hora (${timeStr}). ¡Te esperamos! Si necesitas reagendar, avísanos.`

    const result = await manager.sendMessage(appt.contact.phone, message)
    if (result.success) {
      await db.engineEvent.create({
        data: {
          workspaceId,
          contactId: appt.contactId,
          type: 'APPOINTMENT_REMINDER_SENT',
          metadata: JSON.stringify({ appointmentId: appt.id, date: appt.date.toISOString() }),
        },
      })
      // Aviso también al EQUIPO por Telegram (el cliente pidió recordatorio
      // "a él y al cliente"): quién, a qué hora y su teléfono.
      await broadcastToWorkspace(workspaceId,
        `📅 <b>Cita en ~1 hora</b> (${timeStr})\n\n👤 ${name}${appt.contact.phone ? ` · ${appt.contact.phone}` : ''}\n📋 ${appt.title || 'Cita'}\n\nYa se le envió el recordatorio por WhatsApp al cliente.`
      ).catch(() => {})
      console.log(`[Cron] Reminder sent for appt ${appt.id} → ${appt.contact.phone} at ${timeStr}`)
      sent++
    }
  }

  return { sent }
}

// ─── Appointment Attendance Check (a la hora de la cita) ─────
// Cuando la cita ya pasó (dentro de la ventana de gracia), pregunta al
// equipo por Telegram si el cliente asistió. El asesor responde con los
// botones (appt:attended / appt:noshow) que procesa el webhook de Telegram.
// Si nadie responde dentro de la gracia, processMissedAppointments asume
// no-show y reinicia el timeline.

const ATTENDANCE_GRACE_MS = 60 * 60 * 1000 // 60 min para que el asesor confirme

async function processAppointmentAttendance(workspaceId: string): Promise<{ sent: number }> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - ATTENDANCE_GRACE_MS) // citas que pasaron hace ≤60 min

  const due = await db.appointment.findMany({
    where: {
      workspaceId,
      status: 'pending',
      date: { gte: windowStart, lte: now },
      contactId: { not: null },
    },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
  })

  let sent = 0
  for (const appt of due) {
    if (!appt.contactId) continue

    // Dedup: una sola pregunta de asistencia por cita
    const already = await db.engineEvent.findFirst({
      where: {
        workspaceId,
        contactId: appt.contactId,
        type: 'ATTENDANCE_CHECK_SENT',
        metadata: { contains: appt.id },
      },
    })
    if (already) continue

    const name = appt.contact
      ? `${appt.contact.firstName} ${appt.contact.lastName || ''}`.trim()
      : 'el cliente'

    await notifyAttendanceCheck(workspaceId, {
      contactName: name,
      phone: appt.contact?.phone,
      date: appt.date,
      appointmentId: appt.id,
    })

    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId: appt.contactId,
        type: 'ATTENDANCE_CHECK_SENT',
        metadata: JSON.stringify({ appointmentId: appt.id, date: appt.date.toISOString() }),
      },
    })
    console.log(`[Cron] Attendance check sent for appt ${appt.id} (${name})`)
    sent++
  }

  return { sent }
}

// ─── Escenario 5: Missed Appointment — cancel + restart timeline ─
// Solo actúa como FALLBACK por timeout: citas que pasaron hace MÁS de la
// ventana de gracia y siguen 'pending' (el asesor no confirmó asistencia).

async function processMissedAppointments(workspaceId: string): Promise<{ processed: number }> {
  const now = new Date()
  const graceCutoff = new Date(now.getTime() - ATTENDANCE_GRACE_MS)

  const missed = await db.appointment.findMany({
    where: {
      workspaceId,
      status: 'pending',
      date: { lt: graceCutoff },
      contactId: { not: null },
    },
    select: { id: true, contactId: true, date: true },
  })

  let processed = 0
  for (const appt of missed) {
    if (!appt.contactId) continue

    // Dedup: skip if already processed
    const alreadyProcessed = await db.engineEvent.findFirst({
      where: {
        workspaceId,
        contactId: appt.contactId,
        type: 'MISSED_APPT_PROCESSED',
        metadata: { contains: appt.id },
      },
    })
    if (alreadyProcessed) continue

    // 1. Cancel appointment
    await db.appointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled' },
    })

    // 2. Cancel pending follow-up tasks and reset timeline state
    await resetFollowUpTimeline(appt.contactId)

    // 3. Schedule step 0 from the active conversation
    const conversation = await db.conversation.findFirst({
      where: { workspaceId, contactId: appt.contactId, status: 'active' },
      select: { id: true },
    })
    if (conversation) {
      await scheduleNextFollowUp(appt.contactId, workspaceId, conversation.id, 0)
    }

    // 4. Log to prevent reprocessing
    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId: appt.contactId,
        type: 'MISSED_APPT_PROCESSED',
        metadata: JSON.stringify({ appointmentId: appt.id, originalDate: appt.date.toISOString() }),
      },
    })

    console.log(`[Cron] Missed appt ${appt.id} — contact ${appt.contactId} → cancelled, timeline restarted`)
    processed++
  }

  return { processed }
}

// ─── Escenario 7: Hot Lead Telegram Alert ────────────────────

async function notifyHotInactiveLeads(workspaceId: string): Promise<{ notified: number }> {
  const FORTY_EIGHT_HOURS_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const hotContacts = await db.contact.findMany({
    where: { workspaceId, leadScore: { gte: 60 } },
    select: { id: true, firstName: true, lastName: true, leadScore: true, temperature: true },
  })
  if (hotContacts.length === 0) return { notified: 0 }

  // Exclude contacts that had an inbound message in the last 48h
  const recentInbound = await db.conversation.findMany({
    where: {
      workspaceId,
      contactId: { in: hotContacts.map(c => c.id) },
      messages: { some: { direction: 'inbound', createdAt: { gte: FORTY_EIGHT_HOURS_AGO } } },
    },
    select: { contactId: true },
  })
  const activeIds = new Set(recentInbound.map(c => c.contactId))

  const inactiveHot = hotContacts.filter(c => !activeIds.has(c.id))
  if (inactiveHot.length === 0) return { notified: 0 }

  let notified = 0
  for (const contact of inactiveHot) {
    // Cooldown: skip if already notified in last 48h
    const alreadyNotified = await db.engineEvent.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
        type: 'HOT_LEAD_NOTIFIED',
        createdAt: { gte: FORTY_EIGHT_HOURS_AGO },
      },
    })
    if (alreadyNotified) continue

    // Skip if contact has a confirmed upcoming appointment
    const upcomingAppt = await db.appointment.findFirst({
      where: { contactId: contact.id, status: 'pending', date: { gte: new Date() } },
    })
    if (upcomingAppt) continue

    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Sin nombre'
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const message =
      `🔥 <b>Lead caliente inactivo</b>\n\n` +
      `<b>${esc(name)}</b> (Score: ${contact.leadScore}/100) no ha respondido en más de 48h.\n\n` +
      `Acción recomendada: revisa su conversación y considera una intervención manual.`

    await broadcastToWorkspace(workspaceId, message, {
      inline_keyboard: [[{ text: '🚫 Descartar (que la IA ya no le escriba)', callback_data: `lead:discard:${contact.id}` }]],
    })

    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId: contact.id,
        type: 'HOT_LEAD_NOTIFIED',
        score: contact.leadScore,
        temperature: contact.temperature ?? 'hot',
        metadata: JSON.stringify({ reason: '48h_no_response', score: contact.leadScore }),
      },
    })

    console.log(`[Cron] Hot lead alert sent for contact ${contact.id} (score: ${contact.leadScore})`)
    notified++
  }

  return { notified }
}

// ─── Section 15 — Stale Lead (7 days no response) ────────────
// Spec §15: "Lead {nombre} lleva 7 días sin respuesta. Seguimiento
// automático enviado."
//
// We scan all workspace contacts whose last inbound message was at least
// 7 days ago AND who have a pending follow-up task that we just sent —
// meaning the system already ran a reactivation message on their behalf.
// Per-contact cooldown of 7 days via EngineEvent.
async function notifyStaleLeads7d(workspaceId: string): Promise<{ notified: number }> {
  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Contacts that have had at least one inbound message in their lifetime
  // (otherwise they're "never contacted", not "stalled") AND whose most
  // recent inbound message is older than 7 days.
  const candidates = await db.contact.findMany({
    where: {
      workspaceId,
      // Exclude leads already disabled (closed, noqualify)
      customFields: { not: { contains: '"aiDisabled":true' } },
      conversations: {
        some: {
          messages: {
            some: { direction: 'inbound' },
          },
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      conversations: {
        where: { workspaceId },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
        select: { lastMessageAt: true },
      },
    },
  })

  const stale = candidates.filter(c => {
    const last = c.conversations[0]?.lastMessageAt
    if (!last) return false
    // Get last INBOUND timestamp
    return last.getTime() < SEVEN_DAYS_AGO.getTime()
  })
  if (stale.length === 0) return { notified: 0 }

  let notified = 0
  for (const contact of stale) {
    // Cooldown: skip if a STALE_LEAD_7D_NOTIFIED event was already
    // created in the last 7 days for this contact.
    const alreadyNotified = await db.engineEvent.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
        type: 'STALE_LEAD_7D_NOTIFIED',
        createdAt: { gte: SEVEN_DAYS_AGO },
      },
    })
    if (alreadyNotified) continue

    // Did the system actually send a follow-up?  We use the most recent
    // follow-up task in the last 7 days as a proxy.  If there's no
    // recent task we report "follow-up not sent yet" so the operator
    // knows they should intervene.
    const recentTask = await db.followUpTask.findFirst({
      where: {
        contactId: contact.id,
        createdAt: { gte: SEVEN_DAYS_AGO },
      },
      orderBy: { createdAt: 'desc' },
    })
    const followUpSent = recentTask?.status === 'sent'

    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Sin nombre'
    const daysSince = Math.floor((Date.now() - (contact.conversations[0]?.lastMessageAt?.getTime() ?? Date.now())) / (24 * 60 * 60 * 1000))

    await notifyStaleLead(workspaceId, {
      contactName: name,
      daysSince,
      followUpSent,
      contactId: contact.id,
    })

    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId: contact.id,
        type: 'STALE_LEAD_7D_NOTIFIED',
        metadata: JSON.stringify({ daysSince, followUpSent, lastMessageAt: contact.conversations[0]?.lastMessageAt?.toISOString() }),
      },
    })

    console.log(`[Cron] Stale lead (${daysSince}d) alert sent for contact ${contact.id}`)
    notified++
  }

  return { notified }
}

// ─── GET: Main Cron Endpoint ──────────────────────────────────

export async function GET(req: NextRequest) {
  // Check authorization
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const url = new URL(req.url)
  const isTest = url.pathname.endsWith('/test') || url.searchParams.get('mode') === 'test'
  // Follow-up task processing is permanently delegated to
  // /api/followups/worker. The cron keeps alerts, appointments and DIB
  // scheduling responsibilities but never sends follow-up tasks.

  try {
    // Torre de control (2026-07-20): alerta por Telegram si el WhatsApp de
    // algún tenant está caído. Corre en CADA ciclo del cron (cada 10 min);
    // trae su propio anti-rebote de 1h por workspace.
    try {
      const { alertDisconnectedTenants } = await import('@/lib/ops/health-alert')
      await alertDisconnectedTenants()
    } catch { /* nunca rompe el cron */ }

    // Find active workspace
    const workspaces = await db.workspace.findMany({ where: { isActive: true }, select: { id: true, name: true, settings: true } })
    if (workspaces.length === 0) {
      return NextResponse.json({ error: 'No active workspaces' }, { status: 404 })
    }

    const perWorkspace: Array<{
      workspaceId: string
      workspaceName: string
      followUpTasks: { processed: number; sent: number; failed: number }
      dibReactivation: { candidatesProcessed: number; errors: number; sent: number; pending: number }
      appointmentReminders: { sent: number }
      attendanceChecks: { sent: number }
      missedAppointments: { processed: number }
      hotLeadAlerts: { notified: number }
      staleLeads7d: { notified: number }
    }> = []

    for (const workspace of workspaces) {
      // OPT-IN: la reactivación proactiva (escribe a leads inactivos) SOLO corre
      // si el workspace la activó explícitamente (settings.autoReactivation===true).
      // Default OFF → nadie recibe mensajes automáticos sin haberlo encendido.
      let autoReactivation = false
      try { autoReactivation = JSON.parse((workspace as { settings?: string }).settings || '{}').autoReactivation === true } catch { /* off */ }

      // Step 1: Follow-up tasks are handled exclusively by the worker.
      const taskResult = { processed: 0, sent: 0, failed: 0 }

      // Step 2: Run DIB reactivation cycle — solo si el workspace optó (opt-in).
      const dibResult = (isTest || !autoReactivation)
        ? { processed: 0, results: [], errors: [autoReactivation ? 'Skipped (test)' : 'Skipped (auto-reactivación desactivada)'] }
        : await runReactivationCycle(workspace.id)

      // Step 2b: Reglas de inactividad (FollowUpRule) — mismo opt-in. Agenda
      // tareas que el worker enviará. Con frenos en el evaluador.
      if (autoReactivation && !isTest) {
        try { await evaluateInactivityRules(workspace.id) } catch (e) { console.error('[Cron] inactivity rules error:', e) }
      }

      // Step 3: Appointment reminders (1h before)
      const remindersResult = isTest
        ? { sent: 0 }
        : await processAppointmentReminders(workspace.id)

      // Step 3b: Appointment attendance checks (a la hora de la cita)
      const attendanceResult = isTest
        ? { sent: 0 }
        : await processAppointmentAttendance(workspace.id)

      // Step 4: Missed appointments — fallback por timeout tras la gracia (Escenario 5)
      const missedApptResult = isTest
        ? { processed: 0 }
        : await processMissedAppointments(workspace.id)

      // Step 5: Hot lead Telegram alerts (Escenario 7)
      const hotLeadResult = isTest
        ? { notified: 0 }
        : await notifyHotInactiveLeads(workspace.id)

      // Step 5b: Stale-lead (7 days no response) Telegram alerts (Section 15)
      const staleLeadResult = isTest
        ? { notified: 0 }
        : await notifyStaleLeads7d(workspace.id)

      // Step 6: Clean up old completed tasks (older than 30 days) for THIS workspace only
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

      perWorkspace.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        followUpTasks: taskResult,
        dibReactivation: {
          candidatesProcessed: dibResult.processed,
          errors: dibResult.errors.length,
          sent: dibResult.results.filter(r => r.whatsappSent).length,
          pending: dibResult.results.filter(r => !r.whatsappSent).length,
        },
        appointmentReminders: remindersResult,
        attendanceChecks: attendanceResult,
        missedAppointments: missedApptResult,
        hotLeadAlerts: hotLeadResult,
        staleLeads7d: staleLeadResult,
      })
    }

    // Aprobaciones por Telegram expiradas (timeout → auto-envío). También lo
    // barre /api/cron/automations cada 5 min; aquí es respaldo.
    const approvalTimeouts = isTest ? { sent: 0, cancelled: 0, marketingPublished: 0 } : await processExpiredApprovals().catch(() => ({ sent: 0, cancelled: 0, marketingPublished: 0 }))

    const elapsed = Date.now() - startTime

    return NextResponse.json({
      success: true,
      approvalTimeouts,
      mode: isTest ? 'test' : 'live',
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      workspacesProcessed: workspaces.length,
      perWorkspace,
      whatsappConnected: whatsAppRegistry.all().some((m) => m.isConnected()),
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
