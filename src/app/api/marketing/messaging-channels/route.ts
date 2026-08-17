// ═══════════════════════════════════════════════════════════════
// Estado + config de los canales de MENSAJERÍA por tenant (contrato §Pantalla 6).
// GET  → { telegram: {botConnected, channelChatId}, whatsapp: {connected} }
// POST → guarda settings.marketing.telegram.channelChatId (canal/grupo destino)
// RBAC: crm.write para escribir.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true, waChannel: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const marketing = (s.marketing as Record<string, unknown>) || {}
    const tg = (marketing.telegram as Record<string, unknown>) || {}
    const botConnected = !!(s.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN)
    const channelChatId = (tg.channelChatId as string | undefined) || (s.telegramChannelChatId as string | undefined) || ''

    // WhatsApp: conectado si hay sesión Baileys viva o canal Meta Cloud API.
    let waConnected = false
    try {
      const { getWhatsAppManager } = await import('@/lib/whatsapp/connection')
      waConnected = getWhatsAppManager(workspaceId).isConnected()
    } catch { /* */ }
    if (!waConnected && ws?.waChannel === 'meta') waConnected = true

    return Response.json({
      telegram: { botConnected, channelChatId },
      whatsapp: { connected: waConnected },
    })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, channelChatId } = await req.json() as { workspaceId: string; channelChatId?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const marketing = (s.marketing as Record<string, unknown>) || {}
    marketing.telegram = { ...((marketing.telegram as object) || {}), channelChatId: (channelChatId || '').trim() }
    s.marketing = marketing
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
    return Response.json({ success: true, channelChatId: (channelChatId || '').trim() })
  } catch (error) { return errorResponse(error) }
}
