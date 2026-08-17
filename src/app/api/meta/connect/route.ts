// ═══════════════════════════════════════════════════════════════
// GET /api/meta/connect?workspaceId= — inicia "Conectar Instagram/Facebook"
// (mensajería: Instagram DM + Facebook Messenger). Login de Facebook con los
// permisos de mensajería; al volver por /api/meta/callback se auto-configura
// Página + IG + token y se suscribe el webhook. Sin pegar credenciales.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { signState } from '@/lib/marketing/meta-oauth'

const SCOPES = [
  'pages_show_list', 'pages_messaging', 'pages_manage_metadata', 'pages_read_engagement',
  'business_management', 'instagram_basic', 'instagram_manage_messages',
].join(',')

function htmlMsg(title: string, body: string): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>ValiAutoFlow</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a1f17;color:#e8fff5;margin:0"><div style="text-align:center;padding:32px;max-width:420px"><div style="font-size:44px">⚠️</div><h1 style="font-size:20px;margin:12px 0 6px">${title}</h1><p style="opacity:.8;font-size:14px;line-height:1.5">${body}</p></div></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    const secret = process.env.META_APP_SECRET
    if (!appId || !secret) {
      return htmlMsg('Conexión con un clic no disponible aún', 'Falta configurar la app de Meta (META_APP_SECRET). Usa la configuración manual mientras tanto.')
    }

    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
    const redirectUri = `${base}/api/meta/callback`
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${SCOPES}&state=${signState(workspaceId)}&response_type=code`
    return NextResponse.redirect(url)
  } catch (error) { return errorResponse(error) }
}
