// ═══════════════════════════════════════════════════════════════
// Cron: Briefing diario del Copiloto — GET /api/cron/briefing
// Corre cada ~30 min (Task Scheduler). Para cada workspace con
// settings.copilotBriefing.enabled envía el briefing por Telegram
// (y WhatsApp opcional) a la hora local configurada, una vez al día.
// ═══════════════════════════════════════════════════════════════

import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collectBriefing, formatBriefing } from '@/lib/copilot/briefing'
import { broadcastToWorkspace } from '@/lib/telegram'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'

// Evita solapamientos dentro de la misma instancia. El claim en DB cubre
// ejecuciones concurrentes normales; una cola durable sería la solución final.
const inFlightWorkspaces = new Set<string>()

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-cron-secret')
  const presented = auth?.startsWith('Bearer ') ? auth.slice(7) : cronHeader
  return !!presented && secureEqual(presented, cronSecret)
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

function parseSettings(raw: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const t0 = Date.now()
  const summary = { processed: 0, sent: 0, waiting: 0, alreadySent: 0, busy: 0, failed: 0 }

  try {
    const workspaces = await db.workspace.findMany({ where: { isActive: true }, select: { id: true, settings: true } })
    for (const ws of workspaces) {
      const settings = parseSettings(ws.settings)
      const cfg = (settings.copilotBriefing || {}) as BriefingCfg
      if (!cfg.enabled) continue

      const tz = String(settings.timezone || 'America/Mexico_City')
      const { hour, date } = localNow(tz)
      const targetHour = typeof cfg.hour === 'number' && cfg.hour >= 0 && cfg.hour <= 23 ? cfg.hour : 8
      if (hour < targetHour) { summary.waiting += 1; continue }
      if (cfg.lastSentDate === date) { summary.alreadySent += 1; continue }
      if (inFlightWorkspaces.has(ws.id)) { summary.busy += 1; continue }

      inFlightWorkspaces.add(ws.id)
      let claimedSettings: string | null = null
      let originalSettings: string | null = null
      try {
        // Releer y reclamar atómicamente el día antes de hacer llamadas externas.
        const fresh = await db.workspace.findUnique({ where: { id: ws.id }, select: { settings: true } })
        originalSettings = fresh?.settings ?? '{}'
        const freshSettings = parseSettings(originalSettings)
        const freshCfg = (freshSettings.copilotBriefing || {}) as BriefingCfg
        if (freshCfg.lastSentDate === date || !freshCfg.enabled) {
          summary.alreadySent += 1
          continue
        }
        const nextSettings = {
          ...freshSettings,
          copilotBriefing: { ...(freshSettings.copilotBriefing as object || {}), lastSentDate: date },
        }
        claimedSettings = JSON.stringify(nextSettings)
        const claim = await db.workspace.updateMany({
          where: { id: ws.id, settings: originalSettings },
          data: { settings: claimedSettings },
        })
        if (claim.count !== 1) {
          summary.alreadySent += 1
          continue
        }

        const data = await collectBriefing(ws.id)
        let sentTg = false
        let sentWa = false
        try {
          await broadcastToWorkspace(ws.id, formatBriefing(data, { html: true, timezone: tz }))
          sentTg = true
        } catch { /* keep WhatsApp fallback */ }
        if (freshCfg.whatsappPhone) {
          try {
            const mgr = getWhatsAppManager(ws.id)
            if (mgr.getStatus().connected) {
              const phone = String(freshCfg.whatsappPhone).replace(/\D/g, '')
              if (/^\d{8,15}$/.test(phone)) {
                const result = await mgr.sendMessage(phone, formatBriefing(data, { timezone: tz }))
                sentWa = !!result.success
              }
            }
          } catch { /* one channel may fail while the other succeeds */ }
        }

        if (sentTg || sentWa) {
          summary.processed += 1
          summary.sent += 1
        } else {
          // No se confirmó ningún canal: liberar el claim para permitir reintento.
          if (claimedSettings && originalSettings) {
            await db.workspace.updateMany({ where: { id: ws.id, settings: claimedSettings }, data: { settings: originalSettings } })
          }
          summary.failed += 1
        }
      } catch {
        if (claimedSettings && originalSettings) {
          await db.workspace.updateMany({ where: { id: ws.id, settings: claimedSettings }, data: { settings: originalSettings } }).catch(() => {})
        }
        summary.failed += 1
      } finally {
        inFlightWorkspaces.delete(ws.id)
      }
    }

    return NextResponse.json({ success: true, tookMs: Date.now() - t0, summary })
  } catch {
    return NextResponse.json({ error: 'Error al ejecutar el briefing' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
