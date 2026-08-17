// ═══════════════════════════════════════════════════════════════
// GET    /api/meli/connection?workspaceId= — estado de la conexión
// POST   /api/meli/connection — guarda App ID/Secret/sitio → devuelve authUrl
// DELETE /api/meli/connection?workspaceId= — desconecta (borra tokens)
// RBAC: settings.manage (owner/admin).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { authUrl, platformCreds, generatePkce } from '@/lib/meli/client'
import { logMeli } from '@/lib/meli/log'

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId')
    const member = await requireWorkspace(workspaceId!, session.userId)
    requirePermission(member.role, 'settings.manage')
    const c = await db.meliConnection.findUnique({ where: { workspaceId: workspaceId! } })
    const redirectUri = `${appBaseUrl()}/api/meli/callback`
    return Response.json({
      connected: c?.status === 'connected',
      status: c?.status ?? 'disconnected',
      siteId: c?.siteId ?? 'MLM',
      platformReady: !!platformCreds(),
      hasApp: !!c?.appId,
      appId: c?.appId ?? null,
      nickname: c?.nickname ?? null,
      meliUserId: c?.meliUserId ?? null,
      lastError: c?.lastError ?? null,
      expiresAt: c?.expiresAt ?? null,
      redirectUri,
    })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, appId, appSecret, siteId } = body as { workspaceId: string; appId?: string; appSecret?: string; siteId?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'settings.manage')
    const redirectUri = `${appBaseUrl()}/api/meli/callback`
    const plat = platformCreds()

    // Conexión con un clic: la plataforma ya tiene la app de ML configurada,
    // el usuario solo elige país y autoriza. No pide App ID/Secret.
    if (plat) {
      const { verifier, challenge } = generatePkce()
      const conn = await db.meliConnection.upsert({
        where: { workspaceId },
        create: { workspaceId, siteId: siteId || 'MLM', redirectUri, status: 'disconnected', codeVerifier: verifier },
        update: { siteId: siteId || 'MLM', redirectUri, codeVerifier: verifier },
      })
      const url = authUrl(plat.appId, redirectUri, conn.siteId, workspaceId, challenge)
      return Response.json({ success: true, authUrl: url, redirectUri })
    }

    // Fallback (sin app de plataforma): credenciales por-workspace.
    if (!appId?.trim()) throw new ApiError(400, 'Falta el App ID de tu aplicación de Mercado Libre')
    const { verifier, challenge } = generatePkce()
    const conn = await db.meliConnection.upsert({
      where: { workspaceId },
      create: { workspaceId, appId: appId.trim(), appSecret: appSecret?.trim() || null, siteId: siteId || 'MLM', redirectUri, status: 'disconnected', codeVerifier: verifier },
      update: { appId: appId.trim(), ...(appSecret?.trim() ? { appSecret: appSecret.trim() } : {}), siteId: siteId || 'MLM', redirectUri, codeVerifier: verifier },
    })
    if (!conn.appSecret) throw new ApiError(400, 'Falta el Client Secret de tu aplicación de Mercado Libre')

    const url = authUrl(conn.appId!, redirectUri, conn.siteId, workspaceId, challenge)
    return Response.json({ success: true, authUrl: url, redirectUri })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId')
    const member = await requireWorkspace(workspaceId!, session.userId)
    requirePermission(member.role, 'settings.manage')
    await db.meliConnection.updateMany({
      where: { workspaceId: workspaceId! },
      data: { accessToken: null, refreshToken: null, expiresAt: null, status: 'disconnected', meliUserId: null, nickname: null },
    })
    await logMeli(workspaceId!, 'connect', { targetType: 'connection', status: 'ok', message: 'Cuenta desconectada' })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
