// GET /api/marketing/attribution?workspaceId=&days= — ROI por anuncio y por auto.
import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { buildAttributionReport } from '@/lib/marketing/attribution'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 90))
    const report = await buildAttributionReport(workspaceId, days)
    return Response.json(report)
  } catch (error) { return errorResponse(error) }
}
