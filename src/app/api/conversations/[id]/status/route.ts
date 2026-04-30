// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Conversation Status API
// PUT /api/conversations/[id]/status — Update conversation status
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { status } = body

    const validStatuses = ['active', 'pending', 'closed', 'bot']
    if (!status || !validStatuses.includes(status)) {
      return Response.json(
        { error: `Estado inválido. Valores permitidos: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) {
      return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }

    await requireWorkspace(conversation.workspaceId, session.userId)

    const updated = await db.conversation.update({
      where: { id },
      data: { status },
    })

    return Response.json({ success: true, conversation: updated })
  } catch (error) {
    return errorResponse(error)
  }
}
