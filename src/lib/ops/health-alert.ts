// ═══════════════════════════════════════════════════════════════
// TORRE DE CONTROL — alerta de WhatsApp CAÍDO por tenant.
// La llama el cron de follow-ups (cada 10 min): si un workspace tiene
// número vinculado (settings.connectedPhone) pero su socket NO está
// conectado, avisa por Telegram al equipo del tenant Y al workspace de
// la plataforma (Jhon). Anti-rebote: máx 1 alerta/hora por workspace.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { broadcastToWorkspace } from '@/lib/telegram'

const PLATFORM_WS = process.env.PLATFORM_WORKSPACE_ID || 'cmoxeuojz000k2rbsqxsqtybm' // ValiAutoFlow.com (Jhon)
const waDownAlerted = new Map<string, number>()

export async function alertDisconnectedTenants(): Promise<number> {
  let alerted = 0
  try {
    const wss = await db.workspace.findMany({ where: { isActive: true }, select: { id: true, name: true, settings: true } })
    for (const ws of wss) {
      let s: Record<string, unknown> = {}
      try { s = JSON.parse(ws.settings || '{}') } catch { /* */ }
      if (!s.connectedPhone) continue // nunca ha vinculado — no es una caída
      let connected = false
      try { connected = getWhatsAppManager(ws.id).getStatus().connected } catch { /* */ }
      if (connected) { waDownAlerted.delete(ws.id); continue }
      const last = waDownAlerted.get(ws.id) || 0
      if (Date.now() - last < 60 * 60000) continue
      waDownAlerted.set(ws.id, Date.now())
      alerted++
      const msg = `🔴 <b>WhatsApp DESCONECTADO</b>\n🏢 ${ws.name}\n📱 ${s.connectedPhone}\n\nEl asesor IA no puede responder hasta reconectar. Entra a Configuración → Conexiones y escanea el QR si es necesario.`
      void broadcastToWorkspace(ws.id, msg).catch(() => {})
      if (ws.id !== PLATFORM_WS) {
        void broadcastToWorkspace(PLATFORM_WS, `⚠️ <b>Torre de control</b> — tenant caído\n${msg}`).catch(() => {})
      }
      console.warn(`[HealthAlert] WhatsApp caído en "${ws.name}" (${ws.id}) — alerta enviada`)
    }
  } catch (err) {
    console.warn('[HealthAlert] check failed (non-critical):', (err as Error).message)
  }
  return alerted
}
