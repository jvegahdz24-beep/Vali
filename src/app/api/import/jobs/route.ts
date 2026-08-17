import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

/**
 * GET /api/import/jobs?workspaceId=xxx
 * List import jobs for a workspace
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId es obligatorio' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const jobs = await db.importJob.findMany({
      where: { workspaceId },
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
        updatedAt: true,
      },
    })

    return NextResponse.json({ success: true, jobs })
  } catch (error) {
    return errorResponse(error, 'Error al cargar historial')
  }
}
