import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const status = searchParams.get('status') || 'active'
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId es requerido' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const where: Record<string, unknown> = { workspaceId, channel: 'whatsapp', status }

    const [conversations, total] = await Promise.all([
      db.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          contact: {
            select: {
              id: true, firstName: true, lastName: true, phone: true,
              email: true, avatar: true, leadScore: true, source: true,
            },
          },
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, direction: true, createdAt: true },
          },
        },
      }),
      db.conversation.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      conversations,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener conversaciones de WhatsApp')
  }
}
