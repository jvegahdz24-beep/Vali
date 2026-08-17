// ═══════════════════════════════════════════════════════════════
// POST /api/marketing/caption — genera caption + hashtags para un auto.
// Body: { workspaceId, carId, platform: 'instagram'|'facebook' }
// RBAC: crm.write. Usa IA con fallback determinístico.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { buildCarCreative } from '@/lib/marketing/creative'
import { generateCaption } from '@/lib/marketing/caption'

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, carId, platform } = await req.json() as { workspaceId: string; carId: string; platform?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!carId) throw new ApiError(400, 'Falta el auto')

    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) throw new ApiError(404, 'Auto no encontrado')

    const creative = buildCarCreative(item, ws, baseUrl(req))
    const plat = platform === 'facebook' ? 'facebook' : 'instagram'
    const result = await generateCaption(creative, plat)
    return Response.json({ success: true, ...result })
  } catch (error) { return errorResponse(error) }
}
