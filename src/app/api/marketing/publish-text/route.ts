// ═══════════════════════════════════════════════════════════════
// POST /api/marketing/publish-text — "Publicar directo" del Generador.
// Publica un TEXTO generado a los canales que aceptan texto plano:
//   • Telegram → canal/grupo del tenant (Bot API)
//   • Facebook → post de solo texto en la Página (Graph API)
// Instagram y TikTok requieren medios → se omiten con nota (usa el Estudio).
// Body: { workspaceId, channels: string[], text }. RBAC: crm.write.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { readMetaCreds, canPublishFacebook, fbPublishText } from '@/lib/marketing/meta'
import { telegramPublishToChannel } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, channels, text } = await req.json() as { workspaceId: string; channels: string[]; text: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!text?.trim()) throw new ApiError(400, 'Falta el texto a publicar')
    const chans = Array.isArray(channels) ? channels : []

    const results: { channel: string; status: 'ok' | 'error' | 'skipped'; error?: string; postId?: string }[] = []

    for (const ch of chans) {
      if (ch === 'telegram') {
        const r = await telegramPublishToChannel(workspaceId, { text })
        results.push({ channel: 'telegram', status: r.ok ? 'ok' : 'error', error: r.error, postId: r.messageId ? String(r.messageId) : undefined })
      } else if (ch === 'facebook') {
        const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
        const creds = readMetaCreds(ws?.settings)
        if (!canPublishFacebook(creds)) { results.push({ channel: 'facebook', status: 'error', error: 'Facebook no está conectado' }); continue }
        try { const r = await fbPublishText(creds, text); results.push({ channel: 'facebook', status: 'ok', postId: r.postId }) }
        catch (e) { results.push({ channel: 'facebook', status: 'error', error: e instanceof Error ? e.message : 'Error' }) }
      } else if (ch === 'whatsapp') {
        // WhatsApp es mensajería DIRECTA a leads, no un post de red.
        results.push({ channel: ch, status: 'skipped', error: 'WhatsApp es mensajería directa — usa Campañas Masivas para enviarlo a tus leads' })
      } else {
        // Instagram/TikTok requieren medios (no publican texto-solo).
        results.push({ channel: ch, status: 'skipped', error: `${ch === 'instagram' ? 'Instagram' : ch === 'tiktok' ? 'TikTok' : ch} requiere imagen o video — genera el post en el Estudio de Diseños/Video` })
      }
    }

    const published = results.filter((r) => r.status === 'ok').length
    return Response.json({ success: published > 0, published, results })
  } catch (error) { return errorResponse(error) }
}
