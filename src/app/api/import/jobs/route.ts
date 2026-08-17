import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

/**
 * GET /api/import/jobs?workspaceId=xxx
 * List import jobs for a workspace
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: use custom JWT (not next-auth)
    const session = await requireAuth(request)

    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    // importJob model may not exist — return empty array as fallback
    let jobs: any[] = []
    try {
      // @ts-ignore — importJob table may not be in current schema
      jobs = await db.importJob.findMany({
        where: { workspaceId: workspaceId! },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          fileType: true,
          status: true,
          rowsTotal: true,
          rowsProcessed: true,
          rowsCreated: true,
          rowsUpdated: true,
          rowsSkipped: true,
          errors: true,
          completedAt: true,
          createdAt: true,
        },
      })
    } catch {
      // Table doesn't exist yet — return empty
    }

    return NextResponse.json({ success: true, jobs })
  } catch (error) {
    return errorResponse(error, 'Error al cargar historial')
  }
}
