// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Event Notifiers (Section 15)
// High-level helpers that format + send the 5 spec-mandated events.
// All functions are no-op (Promise.resolve) when no workspace member
// has linked a Telegram chat, so it's safe to call them from any hot
// path without worrying about noise.
//
// Messages are formatted in HTML (parse_mode='HTML') to match the spec's
// example wording verbatim while still supporting basic formatting tags.
// ═══════════════════════════════════════════════════════════════

import { broadcastToWorkspace } from './telegram'
import { getWorkspaceTimezone } from './timezone'

/**
 * Spec §15 — Lead caliente (score > 80)
 * "Lead caliente: {nombre} (score {score}). Atiéndelo."
 *
 * Fires the first time a lead crosses the 80-point threshold. The caller
 * is responsible for de-duping via EngineEvent (we recommend writing an
 * `EngineEvent` of type 'HOT_LEAD_THRESHOLD_CROSSED' right after a
 * successful send).
 */
export async function notifyHotLead(workspaceId: string, args: {
  contactName: string
  score: number
  phone?: string | null
  contactId?: string
}): Promise<void> {
  const phoneLine = args.phone ? `\n📱 ${args.phone}` : ''
  const message =
    `🔥 <b>Lead caliente</b>\n\n` +
    `👤 <b>${escapeHtml(args.contactName)}</b> (score ${args.score}). Atiéndelo.${phoneLine}`
  // Botón para DESCARTAR el lead (la IA deja de escribirle) — pedido de Jhon.
  const replyMarkup = args.contactId
    ? { inline_keyboard: [[{ text: '🚫 Descartar (que la IA ya no le escriba)', callback_data: `lead:discard:${args.contactId}` }]] }
    : undefined
  await broadcastToWorkspace(workspaceId, message, replyMarkup).catch((err) => {
    console.warn('[TelegramEvents] hot lead notify failed:', err)
  })
}

/**
 * Aprobación de seguimientos por Telegram ("control total"): cuando el
 * workspace tiene settings.followUpApproval === 'telegram', cada follow-up
 * automático llega aquí como BORRADOR con botones Aprobar/Descartar en vez
 * de enviarse directo. El webhook procesa fu:send / fu:cancel.
 */
export async function notifyFollowUpApproval(workspaceId: string, args: {
  taskId: string
  contactName: string
  phone?: string | null
  draft: string
}): Promise<void> {
  const message =
    `📝 <b>Seguimiento pendiente de tu aprobación</b>\n\n` +
    `👤 <b>${escapeHtml(args.contactName)}</b>${args.phone ? ` · ${escapeHtml(args.phone)}` : ''}\n\n` +
    `💬 <i>${escapeHtml(args.draft)}</i>\n\n` +
    `¿Enviar este mensaje por WhatsApp?`
  await broadcastToWorkspace(workspaceId, message, {
    inline_keyboard: [[
      { text: '✅ Aprobar y enviar', callback_data: `fu:send:${args.taskId}` },
      { text: '❌ Descartar', callback_data: `fu:cancel:${args.taskId}` },
    ]],
  }).catch((err) => {
    console.warn('[TelegramEvents] followup approval notify failed:', err)
  })
}

/**
 * Spec §15 — Cita agendada
 * "Cita con {nombre} para mañana a las {hora}."
 *
 * `date` may be any future Date. We format the time in 24h (es-MX) and
 * fall back to a relative phrase ("mañana", "hoy", "DD MMM") when the
 * appointment is within 24h of now.
 */
export async function notifyAppointmentBooked(workspaceId: string, args: {
  contactName: string
  date: Date
  title?: string | null
  appointmentId?: string
}): Promise<void> {
  const now = new Date()
  const diffHours = (args.date.getTime() - now.getTime()) / (1000 * 60 * 60)
  const isTomorrow = diffHours > 0 && diffHours < 36
  const isToday = diffHours > -12 && diffHours < 12

  // Format the appointment time in the workspace's business timezone so the
  // alert matches what the customer was told over WhatsApp.
  const tz = await getWorkspaceTimezone(workspaceId)
  const timeStr = args.date.toLocaleTimeString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  const dateParts = new Intl.DateTimeFormat('es-MX', { timeZone: tz, day: 'numeric', month: 'short' }).format(args.date)

  let whenLabel: string
  if (isToday) whenLabel = `hoy a las ${timeStr}`
  else if (isTomorrow) whenLabel = `mañana a las ${timeStr}`
  else whenLabel = `el ${dateParts} a las ${timeStr}`

  const titleSuffix = args.title ? `\n📋 ${escapeHtml(args.title)}` : ''

  const message =
    `📅 <b>Cita agendada</b>\n\n` +
    `Cita con <b>${escapeHtml(args.contactName)}</b> para ${whenLabel}.${titleSuffix}`

  // Inline buttons so the owner can act on the appointment from Telegram.
  const replyMarkup = args.appointmentId
    ? {
        inline_keyboard: [[
          { text: '✅ Confirmar', callback_data: `appt:confirm:${args.appointmentId}` },
          { text: '❌ Cancelar', callback_data: `appt:cancel:${args.appointmentId}` },
          { text: '🔁 Reprogramar', callback_data: `appt:reschedule:${args.appointmentId}` },
        ]],
      }
    : undefined

  await broadcastToWorkspace(workspaceId, message, replyMarkup).catch((err) => {
    console.warn('[TelegramEvents] appointment notify failed:', err)
  })
}

/**
 * Confirmación de asistencia (a la hora de la cita).
 * Pregunta al equipo si el cliente asistió, con botones que el asesor
 * pulsa. El webhook procesa appt:attended / appt:noshow.
 */
export async function notifyAttendanceCheck(workspaceId: string, args: {
  contactName: string
  phone?: string | null
  date: Date
  appointmentId: string
}): Promise<void> {
  const tz = await getWorkspaceTimezone(workspaceId)
  const timeStr = args.date.toLocaleTimeString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  const phoneLine = args.phone ? `\n📱 ${args.phone}` : ''
  const message =
    `📋 <b>Confirmar asistencia</b>\n\n` +
    `Cita con <b>${escapeHtml(args.contactName)}</b> a las ${timeStr}.${phoneLine}\n¿Asistió a su cita?`

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ Sí asistió', callback_data: `appt:attended:${args.appointmentId}` },
      { text: '❌ No asistió', callback_data: `appt:noshow:${args.appointmentId}` },
    ]],
  }

  await broadcastToWorkspace(workspaceId, message, replyMarkup).catch((err) => {
    console.warn('[TelegramEvents] attendance check notify failed:', err)
  })
}

/**
 * Spec §15 — Escalamiento humano
 * "Se necesita intervención humana en conversación con {nombre}."
 *
 * Triggered when a conversation transitions from AI handling to human
 * handling (e.g. transfer_human, manual mode toggle, human agent
 * assignment, sentiment-alert handoff).
 */
export async function notifyHumanEscalation(workspaceId: string, args: {
  contactName: string
  reason?: string
  conversationId?: string
}): Promise<void> {
  const reasonLine = args.reason ? `\n📝 Motivo: ${escapeHtml(args.reason)}` : ''
  const message =
    `🚨 <b>Escalamiento humano</b>\n\n` +
    `Se necesita intervención humana en conversación con <b>${escapeHtml(args.contactName)}</b>.${reasonLine}`

  await broadcastToWorkspace(workspaceId, message).catch((err) => {
    console.warn('[TelegramEvents] escalation notify failed:', err)
  })
}

/**
 * Spec §15 — Lead estancado (7 días sin respuesta)
 * "Lead {nombre} lleva 7 días sin respuesta. Seguimiento automático enviado."
 *
 * The 7-day rule is enforced by the cron caller; this helper just formats
 * and sends.
 */
export async function notifyStaleLead(workspaceId: string, args: {
  contactName: string
  daysSince: number
  followUpSent: boolean
  contactId?: string
}): Promise<void> {
  const followUpLine = args.followUpSent
    ? 'Seguimiento automático enviado.'
    : 'Aún no se ha enviado seguimiento.'
  const message =
    `⏰ <b>Lead estancado</b>\n\n` +
    `Lead <b>${escapeHtml(args.contactName)}</b> lleva ${args.daysSince} días sin respuesta. ${followUpLine}`

  const replyMarkup = args.contactId
    ? { inline_keyboard: [[{ text: '🚫 Descartar (que la IA ya no le escriba)', callback_data: `lead:discard:${args.contactId}` }]] }
    : undefined
  await broadcastToWorkspace(workspaceId, message, replyMarkup).catch((err) => {
    console.warn('[TelegramEvents] stale lead notify failed:', err)
  })
}

/**
 * Spec §15 — Pago fallido
 * "Pago fallido del tenant {nombre}. Suspensión en 3 días."
 */
export async function notifyPaymentFailed(workspaceId: string, args: {
  tenantName: string
  suspensionDays: number
  amount?: number
  currency?: string
}): Promise<void> {
  const amountLine =
    args.amount != null
      ? `\n💰 Monto: ${args.currency || 'USD'} ${args.amount.toFixed(2)}`
      : ''
  const message =
    `💳 <b>Pago fallido</b>\n\n` +
    `Pago fallido del tenant <b>${escapeHtml(args.tenantName)}</b>. Suspensión en ${args.suspensionDays} días.${amountLine}`

  await broadcastToWorkspace(workspaceId, message).catch((err) => {
    console.warn('[TelegramEvents] payment failed notify failed:', err)
  })
}

// ── Helpers ──

/** Minimal HTML escape for user-supplied names before they reach Telegram. */
function escapeHtml(input: string | null | undefined): string {
  if (!input) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
