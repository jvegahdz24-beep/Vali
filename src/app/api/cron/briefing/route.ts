// ═══════════════════════════════════════════════════════════════
// Cron: Briefing diario del Copiloto — GET /api/cron/briefing
// Corre cada ~30 min (Task Scheduler). Para cada workspace con
// settings.copilotBriefing.enabled envía el briefing por Telegram
// (y WhatsApp opcional) a la hora local configurada, una vez al día.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collectBriefing, formatBriefing } from '@/lib/copilot/briefing'
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

interface BriefingCfg { enabled?: boolean; hour?: number; whatsappPhone?: string; lastSentDate?: string }

/** Hora y fecha locales del workspace según su timezone. */
function localNow(tz: string): { hour: number; date: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    return { hour: parseInt(get('hour'), 10), date: `${get('year')}-${get('month')}-${get('day')}` }
  } catch {
    const d = new Date()
    return { hour: d.getHours(), date: d.toISOString().slice(0, 10) }
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const t0 = Date.now()
  const results: Record<string, string> = {}
  try {
    const workspaces = await db.workspace.findMany({ where: { isActive: true }, select: { id: true, settings: true } })
    for (const ws of workspaces) {
      let settings: Record<string, unknown> = {}
      try { settings = JSON.parse(ws.settings || '{}') } catch { /* */ }
      const cfg = (settings.copilotBriefing || {}) as BriefingCfg
      if (!cfg.enabled) continue
      const tz = String(settings.timezone || 'America/Mexico_City')
      const { hour, date } = localNow(tz)
      const targetHour = typeof cfg.hour === 'number' ? cfg.hour : 8
      if (hour < targetHour) { results[ws.id] = `esperando (son las ${hour}, envío a las ${targetHour})`; continue }
      if (cfg.lastSentDate === date) { results[ws.id] = 'ya enviado hoy'; continue }

      // Componer y enviar
      const data = await collectBriefing(ws.id)
      let sentTg = false, sentWa = false
      try { await broadcastToWorkspace(ws.id, formatBriefing(data, { html: true, timezone: tz })); sentTg = true } catch { /* */ }
      if (cfg.whatsappPhone) {
        try {
          const mgr = getWhatsAppManager(ws.id)
          if (mgr.getStatus().connected) {
            const r = await mgr.sendMessage(String(cfg.whatsappPhone).replace(/\D/g, ''), formatBriefing(data, { timezone: tz }))
            sentWa = !!r.success
          }
        } catch { /* */ }
      }
      // Marcar como enviado hoy (releer settings para no pisar cambios)
      const fresh = await db.workspace.findUnique({ where: { id: ws.id }, select: { settings: true } })
      let s2: Record<string, unknown> = {}
      try { s2 = JSON.parse(fresh?.settings || '{}') } catch { /* */ }
      s2.copilotBriefing = { ...(s2.copilotBriefing as object || {}), lastSentDate: date }
      await db.workspace.update({ where: { id: ws.id }, data: { settings: JSON.stringify(s2) } })
      results[ws.id] = `enviado (telegram:${sentTg ? 'ok' : 'no'}, whatsapp:${sentWa ? 'ok' : cfg.whatsappPhone ? 'falló' : 'n/a'})`
    }
    return NextResponse.json({ success: true, tookMs: Date.now() - t0, results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
