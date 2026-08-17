// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Webhook (per-workspace)
// Route: POST /api/telegram/webhook/[workspaceId]
//
// Each workspace registers its own Telegram bot and points its
// webhook here only so users can link their Telegram chat for
// internal notifications. Telegram is not a customer conversation
// channel, so regular messages are ignored.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { publishMarketingDraft, cancelMarketingDraft } from '@/lib/marketing/approval'
import { readAdsCreds, activateCampaign, deleteCampaign } from '@/lib/marketing/ads'
import { runCopilot } from '@/lib/copilot/agent'
import { invalidatePersonalityCache } from '@/lib/ai/message-processor'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      first_name?: string
      last_name?: string
      username?: string
      is_bot?: boolean
    }
    chat: { id: number; type: string }
    text?: string
    date?: number
  }
  callback_query?: {
    id: string
    from?: { id: number; first_name?: string }
    message?: { message_id: number; chat: { id: number } }
    data?: string
  }
}

async function sendTelegramMessage(botToken: string, chatId: string | number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

/** Answer a callback_query so Telegram removes the button's loading spinner. */
async function answerCallback(botToken: string, callbackId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text, show_alert: false }),
  }).catch(() => {})
}

/** Edit the original notification text (e.g. to mark it cancelled/confirmed). */
async function editMessageText(botToken: string, chatId: number, messageId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
  }).catch(() => {})
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── Aprobación de follow-ups desde Telegram (fu:send / fu:cancel) ──
// El borrador vive en task.metadata.draft (lo dejó el cron/worker en modo
// aprobación, con la tarea en status 'awaiting_approval').
async function handleFollowUpCallback(
  botToken: string,
  workspaceId: string,
  cb: NonNullable<TelegramUpdate['callback_query']>
): Promise<boolean> {
  const m = (cb.data || '').match(/^fu:(send|cancel):(.+)$/)
  if (!m) return false
  const [, action, taskId] = m
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id

  const task = await db.followUpTask.findFirst({ where: { id: taskId, workspaceId } })
  if (!task || task.status !== 'awaiting_approval') {
    await answerCallback(botToken, cb.id, 'Este seguimiento ya fue procesado')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, '⚠️ <b>Seguimiento ya procesado</b> (posiblemente por otro miembro del equipo).')
    return true
  }
  let meta: { draft?: string } = {}
  try { meta = JSON.parse(task.metadata || '{}') } catch { /* ignore */ }
  const draft = String(meta.draft || '').trim()
  const contact = await db.contact.findUnique({ where: { id: task.contactId }, select: { firstName: true, lastName: true, phone: true } })
  const who = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'el cliente'

  if (action === 'cancel') {
    await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'descartado desde Telegram' } })
    await answerCallback(botToken, cb.id, '❌ Descartado')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `❌ <b>Seguimiento descartado</b> — ${escHtml(who)}. No se envió nada.`)
    // Bitácora: la decisión tomada en Telegram queda en el expediente del cliente
    const { logTimelineEvent } = await import('@/lib/erp/bitacora')
    await logTimelineEvent({
      workspaceId, contactId: task.contactId, conversationId: task.conversationId,
      type: 'note',
      title: '❌ Seguimiento descartado desde Telegram — no se envió nada',
      detail: meta.draft ? `Borrador descartado: "${String(meta.draft).slice(0, 180)}"` : null,
      source: 'human', importance: 'normal',
    }).catch(() => {})
    return true
  }

  // action === 'send'
  if (!draft || !contact?.phone) {
    await db.followUpTask.update({ where: { id: task.id }, data: { status: 'cancelled', error: 'sin borrador o sin teléfono' } })
    await answerCallback(botToken, cb.id, 'No hay mensaje o teléfono válido')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `⚠️ <b>No se pudo enviar</b> — ${escHtml(who)}: falta el mensaje o el teléfono.`)
    return true
  }
  const mgr = getWhatsAppManager(workspaceId)
  if (!mgr.isConnected()) {
    await answerCallback(botToken, cb.id, 'WhatsApp no está conectado — intenta más tarde')
    return true
  }
  const res = await mgr.sendMessage(contact.phone, draft)
  if (res?.success) {
    await db.followUpTask.update({ where: { id: task.id }, data: { status: 'sent', sentAt: new Date() } })
    await db.message.create({
      data: {
        conversationId: task.conversationId, content: draft, type: 'text', direction: 'outbound',
        senderType: 'agent', isAiGenerated: true, status: 'sent',
        metadata: JSON.stringify({ type: 'cron_follow_up', taskId: task.id, approvedVia: 'telegram' }),
      },
    }).catch(() => null)
    await db.conversation.update({ where: { id: task.conversationId }, data: { lastMessageAt: new Date(), lastMessagePreview: draft.slice(0, 100) } }).catch(() => {})
    await answerCallback(botToken, cb.id, '✅ Enviado')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `✅ <b>Enviado a ${escHtml(who)}</b>\n\n<i>${escHtml(draft.slice(0, 300))}</i>`)
  } else {
    await answerCallback(botToken, cb.id, 'No se pudo enviar por WhatsApp')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `⚠️ <b>No se pudo enviar</b> a ${escHtml(who)} (WhatsApp). El borrador sigue pendiente.`)
  }
  return true
}

// ── Aprobación de publicaciones del PILOTO de marketing (mk:send / mk:cancel) ──
async function handleMarketingCallback(
  botToken: string,
  workspaceId: string,
  cb: NonNullable<TelegramUpdate['callback_query']>
): Promise<boolean> {
  const m = (cb.data || '').match(/^mk:(send|cancel):(.+)$/)
  if (!m) return false
  const [, action, draftId] = m
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')

  if (action === 'cancel') {
    const ok = await cancelMarketingDraft(draftId)
    await answerCallback(botToken, cb.id, ok ? '❌ Descartada' : 'Ya fue procesada')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, ok ? '❌ <b>Publicación descartada</b>. El piloto propondrá otra en el siguiente horario.' : '⚠️ <b>Ya procesada</b> (posiblemente por otro miembro).')
    return true
  }
  await answerCallback(botToken, cb.id, 'Publicando…')
  const r = await publishMarketingDraft(draftId, base)
  if (chatId && messageId) await editMessageText(botToken, chatId, messageId, r.ok ? `✅ <b>Publicado</b> — ${escHtml(r.summary)}` : `⚠️ <b>No se publicó</b> — ${escHtml(r.summary)}`)
  return true
}

// ── Campañas de Meta Ads (ad:on = ACTIVAR gasto / ad:del = eliminar) ──
async function handleAdsCallback(
  botToken: string,
  workspaceId: string,
  cb: NonNullable<TelegramUpdate['callback_query']>
): Promise<boolean> {
  const m = (cb.data || '').match(/^ad:(on|del):(.+)$/)
  if (!m) return false
  const [, action, campaignId] = m
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  const creds = readAdsCreds(ws?.settings)
  try {
    if (action === 'del') {
      await deleteCampaign(creds, campaignId)
      await answerCallback(botToken, cb.id, '🗑️ Eliminada')
      if (chatId && messageId) await editMessageText(botToken, chatId, messageId, '🗑️ <b>Campaña eliminada</b> — no se gastó nada.')
    } else {
      await activateCampaign(creds, campaignId)
      await answerCallback(botToken, cb.id, '▶️ Activada')
      if (chatId && messageId) await editMessageText(botToken, chatId, messageId, '▶️ <b>Campaña ACTIVADA</b> — comenzará a entregarse y a gastar el presupuesto aprobado. Puedes pausarla en el Administrador de Anuncios de Meta.')
    }
  } catch (e) {
    await answerCallback(botToken, cb.id, 'Error')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `⚠️ <b>Error con la campaña</b>: ${escHtml(e instanceof Error ? e.message : 'error')}`)
  }
  return true
}

// ── Descartar lead (lead:discard = detener la IA para ese contacto) ──
async function handleLeadCallback(
  botToken: string,
  workspaceId: string,
  cb: NonNullable<TelegramUpdate['callback_query']>
): Promise<boolean> {
  const m = (cb.data || '').match(/^lead:discard:(.+)$/)
  if (!m) return false
  const [, contactId] = m
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id
  const { discardLead } = await import('@/lib/ai/follow-up-guard')
  const res = await discardLead(contactId, workspaceId, 'telegram').catch(() => null)
  if (res) {
    await answerCallback(botToken, cb.id, '🚫 Lead descartado')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `🚫 <b>Lead descartado</b> — ${escHtml(res.name)}.\n\nLa IA ya no le escribirá ni le responderá automáticamente. Puedes reactivarlo desde el inbox si cambias de opinión.`)
  } else {
    await answerCallback(botToken, cb.id, 'No se pudo descartar (¿ya no existe?)')
  }
  return true
}

// ── Comandos de operación (/pendientes /aprobar /rechazar /estado) ──
async function handleCommand(botToken: string, workspaceId: string, chatId: number, text: string): Promise<boolean> {
  const [cmd, arg] = text.trim().split(/\s+/)
  const send = (t: string) => fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: t, parse_mode: 'HTML' }),
  }).catch(() => {})

  if (cmd === '/pendientes') {
    const [fus, mks] = await Promise.all([
      db.followUpTask.findMany({ where: { workspaceId, status: 'awaiting_approval' }, take: 10, select: { id: true, metadata: true, contactId: true } }),
      db.scheduledPost.findMany({ where: { workspaceId, status: 'awaiting_approval' }, take: 10, select: { id: true, carId: true, caption: true } }),
    ])
    const lines: string[] = []
    for (const t of fus) {
      const c = await db.contact.findUnique({ where: { id: t.contactId }, select: { firstName: true, lastName: true } })
      let draft = ''; try { draft = String(JSON.parse(t.metadata || '{}').draft || '') } catch { /* */ }
      lines.push(`💬 <b>Seguimiento</b> → ${escHtml(`${c?.firstName || ''} ${c?.lastName || ''}`.trim() || 'contacto')}\n   <i>${escHtml(draft.slice(0, 90))}…</i>\n   ID: <code>${t.id.slice(-8)}</code>`)
    }
    for (const d of mks) {
      const car = await db.catalogItem.findUnique({ where: { id: d.carId }, select: { name: true } })
      lines.push(`🎨 <b>Publicación</b> → ${escHtml(car?.name || 'producto')}\n   ID: <code>${d.id.slice(-8)}</code>`)
    }
    await send(lines.length
      ? `📋 <b>Pendientes de aprobación (${lines.length})</b>\n\n${lines.join('\n\n')}\n\nUsa /aprobar &lt;ID&gt; o /rechazar &lt;ID&gt; (o los botones del mensaje original).`
      : '✅ No hay nada pendiente de aprobación.')
    return true
  }

  if (cmd === '/aprobar' || cmd === '/rechazar') {
    const id = (arg || '').trim()
    if (!id) { await send(`Uso: <code>${cmd} &lt;ID&gt;</code> — el ID sale en /pendientes.`); return true }
    const approve = cmd === '/aprobar'
    // buscar por sufijo de ID en seguimientos y publicaciones en espera
    const fu = (await db.followUpTask.findMany({ where: { workspaceId, status: 'awaiting_approval' }, select: { id: true } })).find((t) => t.id.endsWith(id))
    if (fu) {
      const fake = { id: 'cmdcb', data: `fu:${approve ? 'send' : 'cancel'}:${fu.id}`, message: undefined } as NonNullable<TelegramUpdate['callback_query']>
      await handleFollowUpCallback(botToken, workspaceId, fake)
      await send(approve ? '✅ Seguimiento aprobado y enviado (si WhatsApp está conectado).' : '❌ Seguimiento descartado.')
      return true
    }
    const mk = (await db.scheduledPost.findMany({ where: { workspaceId, status: 'awaiting_approval' }, select: { id: true } })).find((d) => d.id.endsWith(id))
    if (mk) {
      const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
      if (approve) { const r = await publishMarketingDraft(mk.id, base); await send(r.ok ? `✅ ${escHtml(r.summary)}` : `⚠️ ${escHtml(r.summary)}`) }
      else { await cancelMarketingDraft(mk.id); await send('❌ Publicación descartada.') }
      return true
    }
    await send('No encontré ese ID en pendientes. Revisa /pendientes.')
    return true
  }

  if (cmd === '/estado') {
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, settings: true } })
    let s: Record<string, unknown> = {}; try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const [agents, fusPend, mksPend] = await Promise.all([
      db.agentInstance.count({ where: { workspaceId, status: 'activo' } }),
      db.followUpTask.count({ where: { workspaceId, status: 'awaiting_approval' } }),
      db.scheduledPost.count({ where: { workspaceId, status: 'awaiting_approval' } }),
    ])
    const wa = getWhatsAppManager(workspaceId).isConnected()
    await send(
      `🧠 <b>Estado — ${escHtml(ws?.name || 'workspace')}</b>\n\n` +
      `📱 WhatsApp: ${wa ? '🟢 conectado' : '🔴 desconectado'}\n` +
      `🤖 Agentes IA activos: ${agents}\n` +
      `🔄 Seguimiento automático: ${s.autoReactivation === true ? '🟢 ON' : '⏸️ OFF'}\n` +
      `🛡️ Aprobación de seguimientos: ${s.followUpApproval === 'telegram' ? '🟢 Telegram' : '⏸️ directa'}\n` +
      `🎨 Aprobación de publicaciones: ${s.marketingApproval === 'telegram' ? '🟢 Telegram' : '⏸️ directa'}\n` +
      `📋 Pendientes: ${fusPend} seguimiento(s) · ${mksPend} publicación(es)\n\n` +
      `Comandos: /pendientes · /aprobar &lt;ID&gt; · /rechazar &lt;ID&gt; · /estado`
    )
    return true
  }

  // ═══ CONTROL REMOTO EJECUTIVO ═══
  const rest = text.trim().slice(cmd.length).trim()
  const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
  const startToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
  const sendKb = (t: string, kb: { text: string; callback_data: string }[][]) => fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } }),
  }).catch(() => {})
  const fullName = (c: { firstName?: string | null; lastName?: string | null } | null) => escHtml(`${c?.firstName || ''} ${c?.lastName || ''}`.trim() || 'contacto')

  if (cmd === '/menu' || cmd === '/help' || cmd === '/ayuda') {
    await sendKb('🎛️ <b>Centro de Mando ValiAutoFlow</b>\nElige una sección o escribe el comando:', [
      [{ text: '📊 Briefing del día', callback_data: 'exec:briefing' }, { text: '🔥 Top leads', callback_data: 'exec:top_leads' }],
      [{ text: '🏷️ Pipeline', callback_data: 'exec:pipeline' }, { text: '📅 Agenda hoy', callback_data: 'exec:agenda_hoy' }],
      [{ text: '📦 Stock', callback_data: 'exec:stock_help' }, { text: '📣 Marketing', callback_data: 'exec:marketing_status' }],
      [{ text: '💰 Avisos financieros', callback_data: 'exec:avisos_financieros' }, { text: '🩺 Estado sistema', callback_data: 'exec:estado_sistema' }],
      [{ text: '📋 Pendientes', callback_data: 'exec:pendientes' }],
    ])
    await send('Otros: /score_cliente &lt;nombre&gt; · /stock &lt;modelo&gt; · /config_ia &lt;0-1&gt; · /copiloto &lt;pregunta&gt;')
    return true
  }

  if (cmd === '/briefing' || cmd === '/resumen') {
    const t0 = startToday()
    const [leadsHoy, dealsHoy, activeDeals, hot] = await Promise.all([
      db.contact.count({ where: { workspaceId, createdAt: { gte: t0 } } }),
      db.deal.count({ where: { workspaceId, OR: [{ status: 'won' }, { stage: { isWon: true } }], wonAt: { gte: t0 } } }).catch(() => 0),
      db.deal.findMany({ where: { workspaceId, status: 'active' }, select: { value: true } }),
      db.contact.findFirst({ where: { workspaceId }, orderBy: { leadScore: 'desc' }, select: { firstName: true, lastName: true, leadScore: true, phone: true } }),
    ])
    const pipelineVal = activeDeals.reduce((s, d) => s + (d.value || 0), 0)
    await send(
      `📊 <b>Briefing del día</b>\n\n` +
      `🆕 Leads nuevos hoy: <b>${leadsHoy}</b>\n` +
      `✅ Ventas cerradas hoy: <b>${dealsHoy}</b>\n` +
      `💼 Pipeline activo: <b>${money(pipelineVal)}</b> (${activeDeals.length} tratos)\n` +
      `🔥 Lead más caliente: <b>${fullName(hot)}</b> (score ${hot?.leadScore ?? 0})${hot?.phone ? ` · ${hot.phone}` : ''}`
    )
    return true
  }

  if (cmd === '/top_leads' || cmd === '/leads') {
    const leads = await db.contact.findMany({ where: { workspaceId }, orderBy: { leadScore: 'desc' }, take: 5, select: { firstName: true, lastName: true, leadScore: true, temperature: true, phone: true } })
    const lines = leads.map((l, i) => `${i + 1}. <b>${fullName(l)}</b> — score ${l.leadScore} ${l.leadScore >= 70 ? '🔥' : l.leadScore >= 40 ? '🟡' : '❄️'}${l.phone ? ` · ${l.phone}` : ''}`)
    await send(lines.length ? `🔥 <b>Top leads (más calientes)</b>\n\n${lines.join('\n')}\n\n💡 Acción: llama o da seguimiento a los 🔥 hoy.` : 'Aún no hay leads.')
    return true
  }

  if (cmd === '/score_cliente' || cmd === '/score') {
    if (!rest) { await send('Uso: <code>/score_cliente &lt;nombre o teléfono&gt;</code>'); return true }
    // Tokenizado: "Juan Pérez" → cada palabra matchea nombre O apellido O teléfono
    const tokens = rest.trim().split(/\s+/).filter(Boolean).slice(0, 5)
    const c = await db.contact.findFirst({
      where: {
        workspaceId,
        AND: tokens.map((t) => ({ OR: [{ firstName: { contains: t } }, { lastName: { contains: t } }, { phone: { contains: t.replace(/\D/g, '') || t } }] })),
      },
      select: { firstName: true, lastName: true, leadScore: true, temperature: true, phone: true, lastMessageAt: true, tags: true },
    })
    if (!c) { await send(`No encontré a "${escHtml(rest)}".`); return true }
    const temp = (c.leadScore ?? 0) >= 70 ? '🔥 Caliente' : (c.leadScore ?? 0) >= 40 ? '🟡 Tibio' : '❄️ Frío'
    await send(`👤 <b>${fullName(c)}</b>\n📊 Score: <b>${c.leadScore}</b> · ${temp}\n📱 ${c.phone || '—'}\n🕐 Última interacción: ${c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('es-MX') : '—'}`)
    return true
  }

  if (cmd === '/stock' || cmd === '/inventario') {
    if (!rest) { await send('Uso: <code>/stock &lt;modelo o palabra&gt;</code> — ej. /stock Raptor'); return true }
    const items = await db.catalogItem.findMany({ where: { workspaceId, name: { contains: rest } }, take: 8, select: { name: true, price: true, currency: true } }).catch(() => [])
    if (!items.length) { await send(`No encontré "${escHtml(rest)}" en el inventario.`); return true }
    const lines = items.map((i) => `• <b>${escHtml(i.name)}</b> — ${i.price ? money(i.price) : 's/precio'}`)
    await send(`📦 <b>Inventario: "${escHtml(rest)}"</b>\n\n${lines.join('\n')}`)
    return true
  }

  if (cmd === '/pipeline' || cmd === '/embudo') {
    const stages = await db.pipelineStage.findMany({ where: { pipeline: { workspaceId } }, orderBy: { order: 'asc' }, select: { id: true, name: true } }).catch(() => [])
    const counts = await Promise.all(stages.map((s) => db.deal.count({ where: { workspaceId, stageId: s.id, status: 'active' } })))
    const wonHoy = await db.deal.count({ where: { workspaceId, OR: [{ status: 'won' }, { stage: { isWon: true } }], wonAt: { gte: startToday() } } }).catch(() => 0)
    const lines = stages.map((s, i) => `${escHtml(s.name)}: <b>${counts[i]}</b>`)
    await send(`🏷️ <b>Embudo de ventas</b>\n\n${lines.join(' | ')}\n✅ Cerrados hoy: <b>${wonHoy}</b>`)
    return true
  }

  if (cmd === '/agenda_hoy' || cmd === '/agenda') {
    const t0 = startToday(); const t1 = new Date(t0.getTime() + 86400000)
    const appts = await db.appointment.findMany({ where: { workspaceId, date: { gte: t0, lt: t1 }, status: 'pending' }, orderBy: { date: 'asc' }, include: { contact: { select: { firstName: true, lastName: true } } } })
    if (!appts.length) { await send('📅 No tienes citas para hoy.'); return true }
    const lines = appts.map((a) => `🕐 ${new Date(a.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} — <b>${escHtml(a.title)}</b>${a.contact ? ` (${fullName(a.contact)})` : ''}`)
    await send(`📅 <b>Agenda de hoy (${appts.length})</b>\n\n${lines.join('\n')}`)
    return true
  }

  if (cmd === '/marketing_status' || cmd === '/marketing') {
    const [pend, campaigns] = await Promise.all([
      db.scheduledPost.count({ where: { workspaceId, status: 'awaiting_approval' } }).catch(() => 0),
      db.marketingCampaign.count({ where: { workspaceId, status: 'active' } }).catch(() => 0),
    ])
    await send(`📣 <b>Marketing</b>\n\n🎯 Campañas activas: <b>${campaigns}</b>\n🖼️ Publicaciones pendientes de aprobar: <b>${pend}</b>${pend > 0 ? '\n\nUsa /pendientes para revisarlas.' : ''}`)
    return true
  }

  if (cmd === '/avisos_financieros' || cmd === '/finanzas') {
    const wsRow = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let rate = 0; try { rate = Number(JSON.parse(wsRow?.settings || '{}').commissionRate) || 0 } catch { /* */ }
    const won = await db.deal.findMany({ where: { workspaceId, OR: [{ status: 'won' }, { stage: { isWon: true } }] }, select: { value: true, metadata: true } }).catch(() => [])
    const comision = won.reduce((s, d) => s + (d.value || 0) * rate / 100, 0)
    const sinFactura = won.filter((d) => { try { return JSON.parse(d.metadata || '{}').cfdi?.status !== 'timbrada' } catch { return true } }).length
    await send(`💰 <b>Avisos financieros</b>\n\n🧾 Facturas CFDI por emitir: <b>${sinFactura}</b>\n💵 Comisiones acumuladas (${rate}%): <b>${money(comision)}</b>\n✅ Ventas ganadas: <b>${won.length}</b>`)
    return true
  }

  if (cmd === '/estado_sistema' || cmd === '/salud') {
    const wa = getWhatsAppManager(workspaceId).isConnected()
    const [agents, meli] = await Promise.all([
      db.agentInstance.count({ where: { workspaceId, status: 'activo' } }),
      db.meliListing.count({ where: { workspaceId } }).catch(() => 0),
    ])
    await send(`🩺 <b>Chequeo del sistema</b>\n\n📱 WhatsApp: ${wa ? '🟢 conectado' : '🔴 desconectado'}\n🤖 Agentes IA activos: <b>${agents}</b>\n🛒 Mercado Libre: ${meli > 0 ? `🟢 ${meli} publicación(es)` : '⏸️ sin publicaciones'}\n🧠 gBrain: 🟢 operativo`)
    return true
  }

  if (cmd === '/config_ia') {
    const val = parseFloat(rest)
    if (isNaN(val) || val < 0 || val > 1) { await send('Uso: <code>/config_ia &lt;0.0 a 1.0&gt;</code> — 0 = frío/preciso, 1 = creativo. Ej: /config_ia 0.7'); return true }
    const wsRow = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}; try { s = JSON.parse(wsRow?.settings || '{}') } catch { /* */ }
    s.aiTemperature = val
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
    invalidatePersonalityCache(workspaceId)
    await send(`✅ Creatividad de la IA ajustada a <b>${val}</b> (aplica a los próximos mensajes).`)
    return true
  }

  if (cmd === '/copiloto' || cmd === '/copilot') {
    if (!rest) { await send('Uso: <code>/copiloto &lt;tu pregunta&gt;</code>\nEj: /copiloto ¿qué clientes no me han comprado en 6 meses?'); return true }
    await send('🤖 Consultando al Copiloto…')
    try {
      const r = await runCopilot([{ role: 'user', content: rest }], { workspaceId, base: (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '') })
      await send(`🤖 <b>Copiloto:</b>\n${escHtml((r.reply || 'Sin respuesta.').slice(0, 3500))}`)
    } catch (e) {
      await send(`⚠️ El Copiloto no pudo responder: ${escHtml(e instanceof Error ? e.message : 'error')}`)
    }
    return true
  }

  return false
}

// ── Taps del menú ejecutivo (exec:<comando>) ──
async function handleExecMenuCallback(botToken: string, workspaceId: string, cb: NonNullable<TelegramUpdate['callback_query']>): Promise<boolean> {
  const data = cb.data || ''
  if (!data.startsWith('exec:')) return false
  const chatId = cb.message?.chat.id
  await answerCallback(botToken, cb.id, '')
  if (!chatId) return true
  const name = data.slice(5)
  if (name === 'stock_help') {
    await sendTelegramMessage(botToken, chatId, 'Escribe <code>/stock &lt;modelo&gt;</code> — ej. /stock Raptor')
    return true
  }
  await handleCommand(botToken, workspaceId, chatId, `/${name}`)
  return true
}

// ── Handle inline-button taps on appointment notifications ──
async function handleAppointmentCallback(
  botToken: string,
  workspaceId: string,
  cb: NonNullable<TelegramUpdate['callback_query']>
): Promise<void> {
  const data = cb.data || ''
  const m = data.match(/^appt:(confirm|cancel|reschedule|attended|noshow):(.+)$/)
  if (!m) { await answerCallback(botToken, cb.id, ''); return }
  const [, action, appointmentId] = m
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id

  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, workspaceId },
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
  })
  if (!appt) {
    await answerCallback(botToken, cb.id, 'La cita ya no existe')
    return
  }
  const who = appt.contact ? `${appt.contact.firstName} ${appt.contact.lastName || ''}`.trim() : 'la cita'

  if (action === 'cancel') {
    await db.appointment.update({ where: { id: appt.id }, data: { status: 'cancelled' } })
    await answerCallback(botToken, cb.id, '❌ Cita cancelada')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `❌ <b>Cita cancelada</b> — ${who}.`)
  } else if (action === 'confirm') {
    await answerCallback(botToken, cb.id, '✅ Cita confirmada')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `✅ <b>Cita confirmada</b> — ${who}.`)
  } else if (action === 'attended') {
    // El cliente SÍ asistió → cita completada, no se reinicia seguimiento frío.
    await db.appointment.update({ where: { id: appt.id }, data: { status: 'completed' } })
    await answerCallback(botToken, cb.id, '✅ Registrado: asistió')
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `✅ <b>Asistió</b> — ${who}.`)
  } else if (action === 'noshow') {
    // No asistió → cancelar y ofrecer reagendar al cliente por WhatsApp.
    await db.appointment.update({ where: { id: appt.id }, data: { status: 'cancelled' } })
    await answerCallback(botToken, cb.id, '❌ Registrado: no asistió')
    let offered = false
    if (appt.contact?.phone) {
      try {
        const mgr = getWhatsAppManager(workspaceId)
        if (mgr.isConnected()) {
          const firstName = appt.contact.firstName || 'Hola'
          const res = await mgr.sendMessage(
            appt.contact.phone,
            `Hola ${firstName} 👋 Notamos que no pudiste asistir a tu cita. ¿Te gustaría reagendar? Dime qué día te acomoda y lo vemos.`
          )
          offered = !!res?.success
        }
      } catch (e) {
        console.warn('[Telegram] noshow reschedule msg failed:', (e as Error).message)
      }
    }
    if (chatId && messageId) await editMessageText(botToken, chatId, messageId, `❌ <b>No asistió</b> — ${who}.${offered ? ' Se le ofreció reagendar.' : ''}`)
  } else {
    // reschedule
    await answerCallback(botToken, cb.id, 'Reprograma desde el calendario o responde con la nueva hora al cliente')
    if (chatId) await sendTelegramMessage(botToken, chatId, `🔁 Para reprogramar la cita de ${who}, ábrela en el Calendario de ValiAutoFlow y cambia la fecha/hora.`)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params

  try {
    // ── Load workspace + settings ──
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, settings: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    let wsSettings: Record<string, unknown> = {}
    try {
      wsSettings = JSON.parse(workspace.settings || '{}')
    } catch { /* ignore */ }

    // ── Resolve bot token (workspace-specific or global fallback) ──
    const botToken = (wsSettings.telegramBotToken as string | undefined)
      || process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      console.error(`[Telegram:${workspaceId}] No bot token configured`)
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 503 })
    }

    // ── Validate webhook secret ──
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token')
    const expectedSecret = (wsSettings.telegramWebhookSecret as string | undefined)
      || process.env.TELEGRAM_WEBHOOK_SECRET

    if (expectedSecret && incomingSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse Telegram update ──
    const update: TelegramUpdate = await req.json()

    // ── Inline-button taps (seguimientos / publicaciones / citas) ──
    if (update.callback_query) {
      const handled = (await handleExecMenuCallback(botToken, workspaceId, update.callback_query))
        || (await handleFollowUpCallback(botToken, workspaceId, update.callback_query))
        || (await handleMarketingCallback(botToken, workspaceId, update.callback_query))
        || (await handleAdsCallback(botToken, workspaceId, update.callback_query))
        || (await handleLeadCallback(botToken, workspaceId, update.callback_query))
      if (!handled) await handleAppointmentCallback(botToken, workspaceId, update.callback_query)
      return NextResponse.json({ ok: true })
    }

    const message = update.message

    if (!message || !message.from || message.from.is_bot) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id
    const text = message.text?.trim() || ''
    const firstName = message.from.first_name || ''

    if (!text) {
      return NextResponse.json({ ok: true })
    }

    // ── Handle /start [token] — link Telegram chat to user account ──
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      const linkToken = parts[1]

      if (linkToken) {
        // Primary path: look up the user by their persisted link token
        // (issued by /api/telegram/link). The token has a TTL, so we
        // reject expired ones. The webhook also still supports the
        // legacy session-token fallback for backwards compatibility.
        const candidate = await db.user.findFirst({
          where: {
            telegramLinkToken: linkToken,
            telegramLinkTokenExpires: { gt: new Date() },
          },
        })

        let pairedUser = candidate
        if (!pairedUser) {
          // Legacy fallback: token = session.sessionToken
          const legacy = await db.session.findFirst({
            where: { sessionToken: linkToken },
            include: { user: true },
          })
          pairedUser = legacy?.user ?? null
        }

        if (pairedUser) {
          await db.user.update({
            where: { id: pairedUser.id },
            data: {
              telegramChatId: String(chatId),
              // Clear the one-time token so it can't be reused
              telegramLinkToken: null,
              telegramLinkTokenExpires: null,
            },
          })
          await sendTelegramMessage(
            botToken,
            chatId,
            `✅ Tu cuenta ValiAutoFlow (${workspace.name}) ha sido vinculada. Recibirás notificaciones aquí.`
          )
        } else {
          await sendTelegramMessage(
            botToken,
            chatId,
            `⚠️ Token inválido o expirado. Genera un nuevo enlace desde la configuración.`
          )
        }
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          `👋 Hola ${firstName || 'usuario'}. Soy el bot de notificaciones de ${workspace.name}. Para vincular tu cuenta, genera un enlace desde Ajustes → Notificaciones.`
        )
      }
      return NextResponse.json({ ok: true })
    }

    // ── Comandos de operación (/pendientes, /aprobar, /rechazar, /estado) ──
    if (text.startsWith('/')) {
      const handled = await handleCommand(botToken, workspaceId, chatId, text)
      if (handled) return NextResponse.json({ ok: true })
    }

    // ── Canal de CLIENTES por Telegram (2026-07-13) ──
    // Si el chat NO pertenece a un miembro del equipo vinculado, es un CLIENTE:
    // su mensaje entra al pipeline de IA (canal 'telegram') y el bot le responde
    // aquí mismo. Los chats vinculados del equipo siguen siendo SOLO de control.
    const teamMember = await db.user.findFirst({ where: { telegramChatId: String(chatId) }, select: { id: true } })
    if (!teamMember && text.trim()) {
      try {
        const { processMessageCore } = await import('@/lib/ai/message-processor')
        const res = await processMessageCore({
          text,
          phone: `tg:${chatId}`, // identidad estable del chat (se unifica al dar su teléfono real)
          pushName: firstName || undefined,
          workspaceId,
          channel: 'telegram',
        })
        if (res?.aiReplyText) await sendTelegramMessage(botToken, chatId, res.aiReplyText)
      } catch (e) {
        console.error('[Telegram customer] pipeline error:', e instanceof Error ? e.message : e)
      }
      return NextResponse.json({ ok: true })
    }

    // Chats del equipo: solo control/notificaciones (sin crear contactos ni IA).
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`[Telegram webhook:${workspaceId}]`, error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
