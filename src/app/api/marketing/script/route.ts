// POST /api/marketing/script — genera un guión de locución para un auto.
// Body: { workspaceId, carId, tone?, durationSec?, extra? }. RBAC crm.write.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { buildCarCreative } from '@/lib/marketing/creative'
import { generateScript } from '@/lib/marketing/script'

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, carId, tone, durationSec, extra } = await req.json() as { workspaceId: string; carId: string; tone?: string; durationSec?: number; extra?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!carId) throw new ApiError(400, 'Falta el auto')
    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) throw new ApiError(404, 'Auto no encontrado')
    const creative = buildCarCreative(item, ws, baseUrl(req))
    const content = await generateScript(creative, { tone, durationSec, extra })
    return Response.json({ success: true, content })
  } catch (error) { return errorResponse(error) }
}
