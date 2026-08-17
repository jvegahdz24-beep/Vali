// ═══════════════════════════════════════════════════════════════
// Cron: REPORTE EJECUTIVO SEMANAL para el dueño de cada agencia.
// GET /api/cron/weekly-report — corre cada ~2h (Task Scheduler); envía
// UNA vez por semana (lunes ≥ 9 am hora local del workspace) el resumen
// de los últimos 7 días por Telegram y, si hay número configurado
// (settings.weeklyReport.whatsappPhone o el del briefing), por WhatsApp.
// Es el arma de retención: el cliente VE el valor cada semana.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcastToWorkspace } from '@/lib/telegram'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = req.headers.get('authorization')
  const cronH = req.headers.get('x-cron-secret')
  return auth === `Bearer ${cronSecret}` || cronH === cronSecret
}

interface WeeklyCfg { enabled?: boolean; whatsappPhone?: string; lastSentWeek?: string }
interface BriefingCfg { whatsappPhone?: string }

function localNow(tz: string): { weekday: number; hour: number; isoWeek: string } {
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    const local = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00`)
    // Semana ISO simple: lunes de esa semana como marcador
    const monday = new Date(local)
    monday.setDate(local.getDate() - ((local.getDay() + 6) % 7))
    return { weekday: local.getDay(), hour: parseInt(get('hour'), 10), isoWeek: monday.toISOString().slice(0, 10) }
  } catch {
    const d = new Date()
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return { weekday: d.getDay(), hour: d.getHours(), isoWeek: monday.toISOString().slice(0, 10) }
  }
}

async function collectWeek(workspaceId: string) {
  const d7 = new Date(Date.now() - 7 * 86400000)
  const [nuevos, inbound, aiMsgs, followupsSent, citas, ganados, activos] = await Promise.all([
    db.contact.count({ where: { workspaceId, createdAt: { gte: d7 }, source: { not: 'manual' } } }),
    db.message.count({ where: { direction: 'inbound', createdAt: { gte: d7 }, conversation: { workspaceId } } }),
    db.message.count({ where: { direction: 'outbound', senderType: 'agent', createdAt: { gte: d7 }, conversation: { workspaceId } } }),
    db.followUpTask.count({ where: { workspaceId, status: 'sent', sentAt: { gte: d7 } } }),
    db.appointment.count({ where: { workspaceId, createdAt: { gte: d7 }, type: { not: 'blocked' } } }),
    db.deal.aggregate({ where: { workspaceId, status: 'won', wonAt: { gte: d7 } }, _count: true, _sum: { value: true } }),
    db.deal.aggregate({ where: { workspaceId, status: 'active' }, _count: true, _sum: { value: true } }),
  ])
  return { nuevos, inbound, aiMsgs, followupsSent, citas, ganadosN: ganados._count, ganadosMonto: ganados._sum.value || 0, activosN: activos._count, activosMonto: activos._sum.value || 0 }
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')

function formatReport(wsName: string, w: Awaited<ReturnType<typeof collectWeek>>, html: boolean): string {
  const b = (t: string) => html ? `<b>${t}</b>` : `*${t}*`
  const lines = [
    `📊 ${b(`Tu semana con ValiAutoFlow — ${wsName}`)}`,
    '',
    `Esto hizo tu asesor IA por ti en los últimos 7 días:`,
    '',
    `👥 Prospectos nuevos atendidos: ${b(String(w.nuevos))}`,
    `💬 Mensajes de clientes recibidos: ${b(String(w.inbound))} · respuestas de la IA: ${b(String(w.aiMsgs))}`,
    `🔁 Seguimientos automáticos enviados: ${b(String(w.followupsSent))}`,
    `📅 Citas agendadas: ${b(String(w.citas))}`,
    `🏆 Ventas cerradas: ${b(`${w.ganadosN} (${money(w.ganadosMonto)})`)}`,
    `📈 Oportunidades activas en tu embudo: ${b(`${w.activosN} (${money(w.activosMonto)})`)}`,
    '',
    `Todo el detalle está en tu panel: valiautoflow.com`,
  ]
  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const results: Record<string, string> = {}
  try {
    const workspaces = await db.workspace.findMany({ where: { isActive: true }, select: { id: true, name: true, settings: true } })
    for (const ws of workspaces) {
      let settings: Record<string, unknown> = {}
      try { settings = JSON.parse(ws.settings || '{}') } catch { /* */ }
      const cfg = (settings.weeklyReport || {}) as WeeklyCfg
      if (cfg.enabled === false) { results[ws.id] = 'desactivado'; continue }
      // Solo workspaces con operación real (WhatsApp vinculado alguna vez)
      if (!settings.connectedPhone) { results[ws.id] = 'sin whatsapp vinculado'; continue }

      const tz = String(settings.timezone || 'America/Mexico_City')
      const { weekday, hour, isoWeek } = localNow(tz)
      if (weekday !== 1) { results[ws.id] = 'no es lunes'; continue }
      if (hour < 9) { results[ws.id] = `esperando las 9 (son las ${hour})`; continue }
      if (cfg.lastSentWeek === isoWeek) { results[ws.id] = 'ya enviado esta semana'; continue }

      const week = await collectWeek(ws.id)
      let sentTg = false, sentWa = false
      try { await broadcastToWorkspace(ws.id, formatReport(ws.name, week, true)); sentTg = true } catch { /* */ }
      const waPhone = cfg.whatsappPhone || ((settings.copilotBriefing || {}) as BriefingCfg).whatsappPhone
      if (waPhone) {
        try {
          const mgr = getWhatsAppManager(ws.id)
          if (mgr.isConnected()) {
            const r = await mgr.sendMessage(String(waPhone).replace(/\D/g, ''), formatReport(ws.name, week, false).replace(/\*/g, '*'))
            sentWa = !!r.success
          }
        } catch { /* */ }
      }

      // Marcar la semana como enviada (releyendo settings para no pisar)
      try {
        const fresh = await db.workspace.findUnique({ where: { id: ws.id }, select: { settings: true } })
        const s2 = (() => { try { return JSON.parse(fresh?.settings || '{}') } catch { return {} } })() as Record<string, unknown>
        s2.weeklyReport = { ...(s2.weeklyReport as object || {}), lastSentWeek: isoWeek }
        await db.workspace.update({ where: { id: ws.id }, data: { settings: JSON.stringify(s2) } })
      } catch { /* */ }
      results[ws.id] = `enviado (telegram:${sentTg ? 'ok' : 'no'}, whatsapp:${sentWa ? 'ok' : waPhone ? 'falló' : 'n/a'})`
      console.log(`[WeeklyReport] ${ws.name}: ${results[ws.id]}`)
    }
    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('[WeeklyReport]', error)
    return NextResponse.json({ error: 'Error interno', results }, { status: 500 })
  }
}
