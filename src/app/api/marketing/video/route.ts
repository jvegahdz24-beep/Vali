// ═══════════════════════════════════════════════════════════════
// POST /api/marketing/video — genera un reel/historia (mp4) avanzado.
// Body: { workspaceId, carId, scenes?, perScene?, transition?, kenBurns?,
//         music?, musicVolume?, accent?, watermark?, narrationText?, voiceId?, voiceSpeed? }
// RBAC: crm.write. Pesado (ffmpeg + TTS): puede tardar.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { buildCarReel, type ReelOpts } from '@/lib/marketing/video'

export const runtime = 'nodejs'
export const maxDuration = 180

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as Partial<ReelOpts> & { workspaceId: string; carId: string }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!body.carId) throw new ApiError(400, 'Falta el auto')
    // Render EN SEGUNDO PLANO: el proxy (Apache) corta a ~30s con 502 y ffmpeg
    // tarda más. Se responde AL INSTANTE con la URL donde quedará el video y el
    // render sigue en el proceso (mismo patrón que el Copiloto). El cliente
    // consulta la URL hasta que exista. (Reporte de Jhon 2026-08-02.)
    const base = baseUrl(req)
    const fileName = `${body.carId}-${Date.now()}.mp4`
    const url = `${base}/api/marketing/media/${fileName}`
    void (async () => {
      try { await buildCarReel({ ...body, base, fileName } as ReelOpts) }
      catch (e) { console.error('[marketing/video] render en segundo plano falló:', e instanceof Error ? e.message : e) }
    })()
    return Response.json({ success: true, url, fileName, pending: true })
  } catch (error) { return errorResponse(error) }
}
