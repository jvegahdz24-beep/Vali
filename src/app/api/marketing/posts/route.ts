// ═══════════════════════════════════════════════════════════════
// GET /api/marketing/posts?workspaceId=  — historial de publicaciones.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const posts = await db.marketingPost.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return Response.json({ posts })
  } catch (error) { return errorResponse(error) }
}
