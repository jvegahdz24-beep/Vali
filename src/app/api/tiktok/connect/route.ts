// GET /api/tiktok/connect?workspaceId= — inicia el OAuth de TikTok.
// Redirige a TikTok para autorizar; vuelve por /api/tiktok/callback.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { readTikTok, tiktokHasApp, tiktokAuthUrl } from '@/lib/marketing/tiktok'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const cfg = readTikTok(ws?.settings)
    if (!tiktokHasApp(cfg)) throw new ApiError(400, 'Primero guarda el Client Key y Client Secret de TikTok en Marketing → Configuración → TikTok')
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
    const url = tiktokAuthUrl(cfg.clientKey!, `${base}/api/tiktok/callback`, workspaceId)
    return NextResponse.redirect(url)
  } catch (error) { return errorResponse(error) }
}
