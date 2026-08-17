// POST /api/tiktok/publish { workspaceId, videoUrl, title } — publica un video
// en TikTok (Direct Post, PULL_FROM_URL). GET ?workspaceId= — estado de conexión.
// RBAC: crm.write.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { readTikTok, tiktokConnected, tiktokHasApp, tiktokPublishVideo } from '@/lib/marketing/tiktok'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const cfg = readTikTok(ws?.settings)
    return Response.json({ hasApp: tiktokHasApp(cfg), connected: tiktokConnected(cfg), username: cfg.username || null })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, videoUrl, title } = await req.json() as { workspaceId: string; videoUrl: string; title?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!videoUrl) throw new ApiError(400, 'Falta el video (genera uno primero)')
    // Mensaje claro si el tenant aún no autorizó su cuenta de TikTok (antes salía
    // "Error interno del servidor" genérico — reporte de Jhon 2026-08-02).
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    if (!tiktokConnected(readTikTok(ws?.settings))) {
      throw new ApiError(400, 'Primero conecta tu cuenta de TikTok: ve a Marketing → Configuración → Conectar con TikTok y autoriza tu cuenta.')
    }
    const publishId = await tiktokPublishVideo(workspaceId, videoUrl, title || 'Nuevo video')
    return Response.json({ success: true, publishId })
  } catch (error) { return errorResponse(error) }
}
