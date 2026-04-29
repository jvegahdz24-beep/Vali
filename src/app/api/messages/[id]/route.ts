// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Single Message API
// PUT /api/messages/:id — Update message metadata (reactions, star)
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
    const { metadata, reaction, isStarred } = body

    const message = await db.message.findUnique({
      where: { id },
      include: { conversation: { select: { workspaceId: true } } },
    })
    if (!message) {
      return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 })
    }

    await requireWorkspace(message.conversation.workspaceId, session.userId)

    // Merge existing metadata with updates
    let currentMeta: Record<string, unknown> = {}
    try {
      currentMeta = message.metadata ? JSON.parse(message.metadata) : {}
    } catch {
      currentMeta = {}
    }

    // Apply reaction update
    if (reaction !== undefined) {
      // Toggle: if same reaction, remove it; otherwise set new
      if (currentMeta.reaction === reaction) {
        delete currentMeta.reaction
      } else {
        currentMeta.reaction = reaction
      }
    }

    // Apply star update
    if (isStarred !== undefined) {
      currentMeta.isStarred = isStarred
    }

    // Apply any direct metadata merge
    if (metadata && typeof metadata === 'object') {
      currentMeta = { ...currentMeta, ...metadata }
    }

    const updated = await db.message.update({
      where: { id },
      data: {
        metadata: JSON.stringify(currentMeta),
      },
    })

    return Response.json({ success: true, message: updated })
  } catch (error) {
    return errorResponse(error)
  }
}
