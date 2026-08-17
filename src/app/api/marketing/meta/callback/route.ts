// ═══════════════════════════════════════════════════════════════
// GET /api/marketing/meta/callback — vuelta del login de Facebook.
// Intercambia el code por token de larga duración, descubre la Página y su
// cuenta de Instagram Business, y guarda todo en settings.marketing (meta+ig)
// automáticamente. El usuario no pega nada. (No requiere requireAuth: Meta
// redirige aquí sin cookie; la seguridad va por el `state` firmado.)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyState } from '@/lib/marketing/meta-oauth'

const GRAPH = 'https://graph.facebook.com/v21.0'

function page(ok: boolean, title: string, body: string): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>ValiAutoFlow</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a1f17;color:#e8fff5;margin:0"><div style="text-align:center;padding:32px;max-width:440px"><div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:20px;margin:12px 0 6px">${title}</h1><p style="opacity:.8;font-size:14px;line-height:1.5">${body}</p><p style="opacity:.6;font-size:12px;margin-top:14px">Ya puedes cerrar esta ventana y volver a ValiAutoFlow.</p></div><script>setTimeout(()=>{try{window.close()}catch(e){}},2500)</script></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') || ''
  const err = req.nextUrl.searchParams.get('error_description') || req.nextUrl.searchParams.get('error')
  if (err) return page(false, 'Conexión cancelada', String(err))
  if (!code) return page(false, 'No se recibió autorización', 'Vuelve a intentar la conexión.')

  // Verifica el state firmado → workspaceId.
  const workspaceId = verifyState(state)
  if (!workspaceId) return page(false, 'Solicitud inválida', 'El enlace de conexión expiró o fue alterado. Reinténtalo.')

  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const secret = process.env.META_APP_SECRET
  if (!appId || !secret) return page(false, 'Falta configurar la app de Meta', 'Configura META_APP_SECRET o pega las credenciales a mano.')

  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
  const redirectUri = `${base}/api/marketing/meta/callback`

  try {
    // 1) code → token de usuario (corto).
    const t1 = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${secret}&code=${encodeURIComponent(code)}`).then(r => r.json()) as { access_token?: string; error?: { message?: string } }
    if (!t1.access_token) return page(false, 'No se pudo iniciar sesión', t1.error?.message || 'Meta no devolvió token.')

    // 2) token corto → token de LARGA duración.
    const t2 = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${t1.access_token}`).then(r => r.json()) as { access_token?: string }
    const userToken = t2.access_token || t1.access_token

    // 3) Páginas del usuario (con page token) + su cuenta de Instagram Business.
    const pages = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`).then(r => r.json()) as { data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>; error?: { message?: string } }
    const list = pages.data || []
    if (!list.length) return page(false, 'No encontramos una Página', 'Tu cuenta debe administrar al menos una Página de Facebook Business. Verifica los permisos y reinténtalo.')

    // Prefiere la Página que ya tiene Instagram conectado.
    const chosen = list.find(p => p.instagram_business_account?.id) || list[0]
    const igId = chosen.instagram_business_account?.id

    // 4) Guarda en settings.marketing (meta + instagram) automáticamente.
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    const mk = (s.marketing as Record<string, Record<string, string>>) || {}
    mk.meta = { ...(mk.meta || {}), accessToken: chosen.access_token, pageId: chosen.id }
    if (igId) mk.instagram = { ...(mk.instagram || {}), accessToken: chosen.access_token, businessAccountId: igId }
    ;(mk as Record<string, unknown>).connectedAt = new Date().toISOString()
    s.marketing = mk
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })

    return page(true, 'Facebook e Instagram conectados', `Página: <b>${chosen.name}</b>${igId ? ' · Instagram Business vinculado' : ' · (sin Instagram Business en esta Página)'}. Ya puedes publicar automáticamente.`)
  } catch (e) {
    return page(false, 'Error al conectar', e instanceof Error ? e.message : 'Inténtalo de nuevo.')
  }
}
