// GET /api/marketing/seasonal?workspaceId= — sugerencias de calendario por temporada.
import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { seasonalSuggestions } from '@/lib/marketing/seasonal'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const data = await seasonalSuggestions(workspaceId)
    return Response.json(data)
  } catch (error) { return errorResponse(error) }
}
