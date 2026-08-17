// ═══════════════════════════════════════════════════════════════
// POST /api/marketing/publish-video — publica un VIDEO ya generado en las redes.
// Body: { workspaceId, videoUrl, networks:['facebook','instagram','tiktok'], carId?, caption? }
//   • facebook → video en la Página (fbPublishVideo)
//   • instagram → Reel (igPublishReel)
//   • tiktok → Content Posting API (tiktokPublishVideo)
// Si no se pasa caption, lo GENERA con IA (copy + hashtags) por red, igual que
// el Estudio de Diseños. RBAC: crm.write.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { readMetaCreds, canPublishFacebook, canPublishInstagram, fbPublishVideo, igPublishReel } from '@/lib/marketing/meta'
import { readTikTok, tiktokConnected, tiktokPublishVideo } from '@/lib/marketing/tiktok'
import { buildCarCreative } from '@/lib/marketing/creative'
import { generateCaption } from '@/lib/marketing/caption'
import { readLearnedStats } from '@/lib/marketing/learning'

export const runtime = 'nodejs'
export const maxDuration = 120

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, videoUrl, networks, carId, caption } = await req.json() as { workspaceId: string; videoUrl: string; networks: string[]; carId?: string; caption?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!videoUrl) throw new ApiError(400, 'Falta el video (genera uno primero)')
    const nets = (Array.isArray(networks) ? networks : []).filter(n => ['facebook', 'instagram', 'tiktok'].includes(n))
    if (!nets.length) throw new ApiError(400, 'Elige al menos una red')

    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } })
    const provided = (caption || '').trim()

    // Caption con IA (copy + hashtags) si no se pasó uno. Se cachea por "estilo"
    // de red (facebook vs instagram) para no llamar dos veces a la IA.
    const item = carId ? await db.catalogItem.findFirst({ where: { id: carId, workspaceId } }) : null
    const learned = readLearnedStats(ws?.settings)?.topCaptions
    const capCache: Record<string, string> = {}
    const captionFor = async (net: string): Promise<string> => {
      if (provided) return provided
      if (!item || !ws) return ''
      const styleKey = net === 'facebook' ? 'facebook' : 'instagram'
      if (capCache[styleKey]) return capCache[styleKey]
      try {
        const creative = buildCarCreative(item, ws, baseUrl(req))
        const c = await generateCaption(creative, styleKey as 'facebook' | 'instagram', undefined, learned)
        capCache[styleKey] = `${c.text}\n\n${c.hashtags.join(' ')}`.trim()
      } catch { capCache[styleKey] = item.name }
      return capCache[styleKey]
    }

    const results: { network: string; status: 'ok' | 'error'; postId?: string; error?: string }[] = []
    for (const net of nets) {
      try {
        const cap = await captionFor(net)
        if (net === 'facebook') {
          const creds = readMetaCreds(ws?.settings)
          if (!canPublishFacebook(creds)) { results.push({ network: net, status: 'error', error: 'Facebook no está conectado (Configuración → Conectar con Facebook)' }); continue }
          const r = await fbPublishVideo(creds, videoUrl, cap)
          results.push({ network: net, status: 'ok', postId: r.postId })
        } else if (net === 'instagram') {
          const creds = readMetaCreds(ws?.settings)
          if (!canPublishInstagram(creds)) { results.push({ network: net, status: 'error', error: 'Instagram no está conectado (Configuración → Conectar con Facebook)' }); continue }
          const r = await igPublishReel(creds, videoUrl, cap)
          results.push({ network: net, status: 'ok', postId: r.postId })
        } else if (net === 'tiktok') {
          if (!tiktokConnected(readTikTok(ws?.settings))) { results.push({ network: net, status: 'error', error: 'TikTok no está conectado (Configuración → Conectar con TikTok)' }); continue }
          const pid = await tiktokPublishVideo(workspaceId, videoUrl, cap || 'Nuevo video')
          results.push({ network: net, status: 'ok', postId: pid })
        }
      } catch (e) {
        results.push({ network: net, status: 'error', error: e instanceof Error ? e.message : 'Error al publicar' })
      }
    }

    const published = results.filter(r => r.status === 'ok').length
    return Response.json({ success: published > 0, published, results })
  } catch (error) { return errorResponse(error) }
}
