// ═══════════════════════════════════════════════════════════════
// Callback OAuth de MENSAJERÍA Meta (Instagram DM + Facebook Messenger).
// Recibe ?code de Facebook, intercambia por token, descubre la Página + IG +
// Page Access Token, suscribe la Página al webhook de la app (messages) y guarda
// el metaChannel del workspace. Estado firmado (state) = workspaceId.
// Redirect URI a registrar en la app de Meta: https://valiautoflow.com/api/meta/callback
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyState } from '@/lib/marketing/meta-oauth'
import crypto from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

function page(ok: boolean, title: string, msg: string): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>ValiAutoFlow</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a1f17;color:#e8fff5;margin:0"><div style="text-align:center;padding:32px;max-width:420px"><div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:20px;margin:12px 0 6px">${title}</h1><p style="opacity:.8;font-size:14px;line-height:1.5">${msg}</p><p style="opacity:.5;font-size:12px;margin-top:14px">Puedes cerrar esta ventana.</p></div><script>try{setTimeout(function(){window.close()},2500)}catch(e){}</script></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const state = req.nextUrl.searchParams.get('state') || ''
  if (error) return page(false, 'Conexión cancelada', 'No se otorgaron los permisos. Vuelve a intentarlo desde ValiAutoFlow.')
  if (!code) return page(false, 'Falta el código', 'Meta no devolvió el código de autorización.')

  const workspaceId = verifyState(state)
  if (!workspaceId) return page(false, 'Estado inválido', 'El enlace expiró o fue manipulado. Inténtalo de nuevo.')

  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const secret = process.env.META_APP_SECRET
  if (!appId || !secret) return page(false, 'Falta configurar Meta', 'La app de Meta de la plataforma no está configurada (META_APP_SECRET).')

  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
  const redirectUri = `${base}/api/meta/callback`

  try {
    // 1. code → user token
    const tokRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${secret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`)
    const tok = await tokRes.json() as { access_token?: string; error?: { message?: string } }
    if (!tok.access_token) throw new Error(tok.error?.message || 'No se pudo obtener el token de acceso')

    // 2. token de larga duración
    const llRes = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${tok.access_token}`)
    const ll = await llRes.json() as { access_token?: string }
    const userToken = ll.access_token || tok.access_token

    // 3. Página(s) del usuario + IG vinculado + Page Access Token
    const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`)
    const pages = await pagesRes.json() as { data?: Array<{ id: string; name?: string; access_token: string; instagram_business_account?: { id?: string } }>; error?: { message?: string } }
    const pg = (pages.data || [])[0]
    if (!pg) throw new Error(pages.error?.message || 'No se encontró ninguna Página de Facebook en tu cuenta. Administra una Página y reintenta.')
    const igId = pg.instagram_business_account?.id || null

    // 4. Suscribir la Página al webhook de la app (mensajes de Messenger/IG)
    await fetch(`${GRAPH}/${pg.id}/subscribed_apps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks', 'message_reactions', 'messaging_referral'], access_token: pg.access_token }),
    }).catch(() => { /* si falla, igual guardamos; se puede suscribir manual */ })

    // 5. Guardar metaChannel (una Página no puede estar en dos workspaces)
    const clash = await db.metaChannel.findUnique({ where: { pageId: pg.id } })
    if (clash && clash.workspaceId !== workspaceId) return page(false, 'Página en uso', 'Esa Página de Facebook ya está conectada a otra cuenta de ValiAutoFlow.')

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || `vali_${crypto.randomBytes(5).toString('hex')}`
    const data = { workspaceId, pageId: pg.id, pageName: pg.name || null, igAccountId: igId, pageAccessToken: pg.access_token, verifyToken, isActive: true }
    const existing = await db.metaChannel.findFirst({ where: { workspaceId } })
    if (existing) await db.metaChannel.update({ where: { id: existing.id }, data })
    else await db.metaChannel.create({ data })

    return page(true, 'Instagram y Facebook conectados', `Página "${pg.name || pg.id}"${igId ? ' + Instagram' : ''} lista. Los DMs de Instagram y Messenger ya se responden con IA.`)
  } catch (e) {
    return page(false, 'No se pudo conectar', e instanceof Error ? e.message : 'Error al conectar con Meta')
  }
}
