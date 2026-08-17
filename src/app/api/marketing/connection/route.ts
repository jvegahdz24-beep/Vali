// ═══════════════════════════════════════════════════════════════
// GET /api/marketing/connection?workspaceId= — qué redes están listas
// para publicar (según las credenciales guardadas en Configuración).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { readMetaCreds, canPublishFacebook, canPublishInstagram } from '@/lib/marketing/meta'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const creds = readMetaCreds(ws?.settings)
    return Response.json({
      facebook: canPublishFacebook(creds),
      instagram: canPublishInstagram(creds),
    })
  } catch (error) { return errorResponse(error) }
}
