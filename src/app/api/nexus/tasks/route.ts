import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/tasks — List tasks
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const workspaceId = searchParams.get('workspaceId') || undefined

    const where: Record<string, unknown> = {
      userId: session.userId,
      ...(status && status !== 'all' ? { status } : {}),
      // If workspaceId is provided, scope NEXUS tasks to that workspace
      ...(workspaceId ? { workspaceId } : {}),
    }

    const tasks = await db.nexusTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ tasks })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/tasks — Create task
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { title, description, priority, dueDate, workspaceId } = body

    if (!title) {
      return Response.json({ error: 'Título es requerido' }, { status: 400 })
    }

    const task = await db.nexusTask.create({
      data: {
        userId: session.userId,
        workspaceId: workspaceId || null,
        title,
        description,
        priority: priority || 'medium',
        source: 'user',
        dueDate: dueDate ? new Date(dueDate) : null,
      }
    })

    return Response.json({ task }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

// PATCH /api/nexus/tasks — Update task status
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return Response.json({ error: 'ID y status son requeridos' }, { status: 400 })
    }

    const task = await db.nexusTask.findFirst({
      where: { id, userId: session.userId }
    })

    if (!task) {
      return Response.json({ error: 'Tarea no encontrada' }, { status: 404 })
    }

    const updated = await db.nexusTask.update({
      where: { id },
      data: {
        status,
        ...(status === 'completed' ? { completedAt: new Date() } : {}),
      }
    })

    return Response.json({ task: updated })
  } catch (error) {
    return errorResponse(error)
  }
}
