import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/conversations/[id] — Get conversation with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    const { id } = await params

    const conversation = await db.nexusConversation.findFirst({
      where: { id, userId: session.userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        }
      }
    })

    if (!conversation) {
      return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }

    return Response.json({ conversation })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/nexus/conversations/[id] — Archive conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request)
    const { id } = await params

    const conv = await db.nexusConversation.findFirst({
      where: { id, userId: session.userId }
    })

    if (!conv) {
      return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }

    await db.nexusConversation.update({
      where: { id },
      data: { status: 'archived' }
    })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
