import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('conversationId')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId es requerido' }, { status: 400 })
    }

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, channel: true, workspaceId: true },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }

    // Nunca confíes solo en el conversationId: el recurso debe pertenecer
    // al workspace del usuario autenticado.
    await requireWorkspace(conversation.workspaceId, session.userId)

    const [messages, total] = await Promise.all([
      db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      db.message.count({ where: { conversationId } }),
    ])

    return NextResponse.json({
      success: true,
      messages,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener mensajes')
  }
}
