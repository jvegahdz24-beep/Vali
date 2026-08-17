// GET /api/marketing/tips?workspaceId= — consejos IA accionables del negocio.

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { generateTips } from '@/lib/marketing/tips'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    return Response.json(await generateTips(workspaceId))
  } catch (error) { return errorResponse(error) }
}
