// AUTO-RESPUESTA A COMENTARIOS DE FACEBOOK (F3, 2026-07-22)
// GET  ?workspaceId= → comentarios recientes de tus últimas publicaciones FB.
// POST { workspaceId, run:true } → la IA responde los comentarios NUEVOS e invita
//   a escribir por WhatsApp. Dedup por settings.marketing.repliedComments.
// Requiere que la app de Meta del cliente tenga permisos de gestión de comentarios.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { readMetaCreds, fbPostComments, fbReplyComment } from '@/lib/marketing/meta'
import { chatWithAI } from '@/lib/ai'

async function recentFbPosts(workspaceId: string) {
  return db.marketingPost.findMany({
    where: { workspaceId, network: 'facebook', status: 'ok', postId: { not: null }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    orderBy: { createdAt: 'desc' }, take: 15, select: { postId: true, caption: true, carId: true },
  })
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const creds = readMetaCreds(ws?.settings)
    if (!creds.fbToken) return Response.json({ connected: false, message: 'Conecta Facebook para gestionar comentarios.', comments: [] })
    const posts = await recentFbPosts(workspaceId)
    const all: { commentId: string; from?: string; message: string; postCaption: string }[] = []
    for (const p of posts.slice(0, 8)) {
      const cs = await fbPostComments(creds, p.postId!, 15)
      for (const c of cs) all.push({ commentId: c.id, from: c.from, message: c.message, postCaption: (p.caption || '').slice(0, 50) })
    }
    return Response.json({ connected: true, comments: all.slice(0, 40) })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId } = await req.json() as { workspaceId: string }
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, settings: true } })
    const creds = readMetaCreds(ws?.settings)
    if (!creds.fbToken) return Response.json({ error: 'Facebook no está conectado.' }, { status: 400 })

    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const mkt = (s.marketing as Record<string, unknown>) || {}
    const replied = new Set<string>(Array.isArray(mkt.repliedComments) ? (mkt.repliedComments as string[]) : [])
    const waPhone = String((mkt.whatsappPhone as string) || (s.connectedPhone as string) || '').replace(/\D/g, '')

    const posts = await recentFbPosts(workspaceId)
    let answered = 0
    for (const p of posts.slice(0, 8)) {
      const cs = await fbPostComments(creds, p.postId!, 15)
      for (const c of cs) {
        if (replied.has(c.id) || !c.message.trim()) continue
        // No responder comentarios de la propia página
        // IA: respuesta corta, cálida, que invita a WhatsApp.
        let reply = ''
        try {
          const r = await chatWithAI([
            { role: 'system', content: `Eres el community manager de ${ws?.name || 'la agencia'}. Responde comentarios de Facebook en 1-2 líneas, cálido y mexicano, SIN emojis excesivos (máx 1). Invita SIEMPRE a escribir por WhatsApp${waPhone ? ` al ${waPhone}` : ''} para más info. NO inventes precios ni datos.` },
            { role: 'user', content: `Publicación: "${(p.caption || '').slice(0, 80)}". Comentario de ${c.from || 'un usuario'}: "${c.message.slice(0, 200)}". Redacta SOLO la respuesta.` },
          ], 'minimax', undefined, { temperature: 0.7, maxTokens: 160 })
          reply = (r.content || '').trim().replace(/\*\*/g, '').slice(0, 400)
        } catch { /* sin IA */ }
        if (!reply) continue
        const okr = await fbReplyComment(creds, c.id, reply)
        if (okr) { replied.add(c.id); answered++ }
      }
    }
    // Persistir los IDs respondidos (capado a 500)
    mkt.repliedComments = [...replied].slice(-500)
    s.marketing = mkt
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
    return Response.json({ success: true, answered })
  } catch (error) { return errorResponse(error) }
}
