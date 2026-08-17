// GET /api/meli/logs?workspaceId= — bitácora / trazabilidad de Mercado Libre
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId')!
    await requireWorkspace(workspaceId, session.userId)
    const items = await db.meliLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200 })
    return Response.json({ items })
  } catch (error) { return errorResponse(error) }
}
