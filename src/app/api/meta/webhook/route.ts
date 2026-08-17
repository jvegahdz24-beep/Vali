// ═══════════════════════════════════════════════════════════════
// Webhook genérico de Meta (Instagram/Facebook/Threads) — verificación y
// recepción de eventos.
// GET  → handshake de Meta: valida hub.verify_token (META_WEBHOOK_VERIFY_TOKEN)
//        y responde hub.challenge en texto plano.
// POST → recibe eventos (comentarios, menciones, etc.). Por ahora solo se
//        registran en logs (la atención entrante de IG/FB es una fase futura);
//        Meta exige responder 200 rápido para no desactivar el webhook.
// Público en middleware (sin JWT): la seguridad es el verify token del GET.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mode = p.get('hub.mode')
  const token = p.get('hub.verify_token')
  const challenge = p.get('hub.challenge') || ''
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || ''
  if (mode === 'subscribe' && expected && token === expected) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return new Response('Forbidden', { status: 403 })
}

// Mapea el id de página/IG del evento al workspace dueño (settings.marketing).
async function workspaceForAsset(assetId: string): Promise<string | null> {
  const { db } = await import('@/lib/db')
  const rows = await db.workspace.findMany({ where: { isActive: true }, select: { id: true, settings: true } })
  for (const w of rows) {
    try {
      const mk = JSON.parse(w.settings || '{}').marketing || {}
      if (mk.meta?.pageId === assetId || mk.instagram?.businessAccountId === assetId) return w.id
    } catch { /* ignore */ }
  }
  return null
}

interface MetaEntry {
  id: string
  changes?: Array<{ field?: string; value?: { from?: { username?: string; name?: string }; text?: string; message?: string; comment_id?: string; media?: { id?: string } } }>
  messaging?: Array<{ sender?: { id?: string }; message?: { text?: string } }>
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    console.log('[MetaWebhook] evento recibido:', raw.slice(0, 400))
    const body = JSON.parse(raw) as { object?: string; entry?: MetaEntry[] }
    if (!Array.isArray(body.entry)) return new Response('OK', { status: 200 })

    const { broadcastToWorkspace } = await import('@/lib/telegram')
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    for (const entry of body.entry) {
      const wsId = await workspaceForAsset(String(entry.id || ''))
      if (!wsId) continue
      const red = body.object === 'instagram' ? 'Instagram' : 'Facebook'
      // Comentarios / menciones
      for (const ch of entry.changes || []) {
        const v = ch.value || {}
        const who = v.from?.username || v.from?.name || 'alguien'
        const texto = (v.text || v.message || '').slice(0, 200)
        if (ch.field === 'comments' || ch.field === 'mentions' || ch.field === 'feed') {
          await broadcastToWorkspace(wsId,
            `💬 <b>Nuevo ${ch.field === 'mentions' ? 'mención' : 'comentario'} en ${red}</b>\n\n` +
            `👤 ${esc(who)}\n📝 <i>${esc(texto) || '(sin texto)'}</i>\n\n` +
            `Respóndelo desde la app de ${red}. (La respuesta automática desde el sistema llega en la fase de bandeja ${red}.)`
          ).catch(() => {})
        }
      }
      // Mensajes directos (cuando Meta habilite los permisos de mensajería)
      for (const m of entry.messaging || []) {
        const texto = (m.message?.text || '').slice(0, 200)
        if (texto) await broadcastToWorkspace(wsId, `📩 <b>Mensaje directo en ${red}</b>\n\n<i>${esc(texto)}</i>`).catch(() => {})
      }
    }
  } catch { /* ignore — nunca fallar ante Meta */ }
  // Siempre 200: si Meta recibe errores repetidos, desactiva la suscripción.
  return new Response('OK', { status: 200 })
}
