// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Single Conversation API
// GET /api/conversations/:id — Get conversation with messages
// POST /api/conversations/:id — Send message
// PUT /api/conversations/:id — Update conversation
// DELETE /api/conversations/:id — Soft-delete conversation
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { notifyHumanEscalation } from '@/lib/telegram-events'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const allMessages = searchParams.get('all') === 'true' || searchParams.get('all') === '1'
    const limit = allMessages
      ? undefined
      : Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100)

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            avatar: true,
            leadScore: true,
            tags: true,
            source: true,
            customFields: true,
            notes: true,
          },
        },
      },
    })

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }

    await requireWorkspace(conversation.workspaceId, session.userId)

    // Get messages. The inbox can request all=true so opening a chat shows
    // the complete persisted WhatsApp history instead of only the first page.
    const messageQuery: any = {
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        mediaFiles: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            filePath: true,
            thumbnailPath: true,
            caption: true,
            source: true,
            metadata: true,
          },
        },
      },
    }
    if (!allMessages && limit !== undefined) {
      messageQuery.skip = (page - 1) * limit
      messageQuery.take = limit
    }

    const [messages, total] = await Promise.all([
      db.message.findMany(messageQuery),
      db.message.count({ where: { conversationId: id } }),
    ])

    return Response.json({
      conversation: {
        ...conversation,
        tags: conversation.contact?.tags ? JSON.parse(conversation.contact.tags) : [],
      },
      messages,
      pagination: {
        page,
        pageSize: allMessages ? total : limit,
        total,
        totalPages: allMessages || !limit ? 1 : Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { content, type = 'text', direction = 'outbound', senderType = 'human', channel } = body

    if (!content) {
      return Response.json({ error: 'content is required' }, { status: 400 })
    }

    // Verify conversation exists
    const conversation = await db.conversation.findUnique({
      where: { id },
    })
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const member = await requireWorkspace(conversation.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write') // Lector no puede enviar mensajes

    // Save the message
    const message = await db.message.create({
      data: {
        conversationId: id,
        content,
        type,
        direction,
        senderType,
      },
    })

    // Update conversation
    await db.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: content.slice(0, 100),
      },
    })

    // Track event
    await db.analyticsEvent.create({
      data: {
        workspaceId: conversation.workspaceId,
        eventType: direction === 'outbound' ? 'message_sent' : 'message_received',
        eventData: JSON.stringify({ channel: conversation.channel, type, senderType }),
      },
    })

    return Response.json({ success: true, message }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { status, assignedTo, assignedAgentId, channel, aiDisabled, aiPausedUntil } = body

    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) {
      return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }
    const member = await requireWorkspace(conversation.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo || null
    if (assignedAgentId !== undefined) updateData.assignedAgentId = assignedAgentId || null
    if (channel !== undefined) updateData.channel = channel
    if (aiDisabled !== undefined || aiPausedUntil !== undefined) {
      const meta = JSON.parse(conversation.metadata || '{}')
      if (aiDisabled !== undefined) {
        meta.aiDisabled = !!aiDisabled
        // Trazabilidad (2026-07-22): registrar quién/por qué apagó la IA para no
        // volver a tener leads "mudos" sin explicación (caso Mauricio, de anuncio).
        if (aiDisabled) { meta.aiDisabledReason = 'pausado manualmente desde inbox'; meta.aiDisabledAt = new Date().toISOString(); meta.aiDisabledBy = session.userId }
        else { delete meta.aiDisabledReason; delete meta.aiDisabledAt; delete meta.aiDisabledBy }
      }
      // Pausa TEMPORAL del bot: ISO string con vencimiento, o null para quitarla.
      // El message-processor reactiva la IA solo cuando aiPausedUntil ya venció.
      if (aiPausedUntil !== undefined) {
        if (aiPausedUntil) meta.aiPausedUntil = String(aiPausedUntil)
        else delete meta.aiPausedUntil
      }
      updateData.metadata = JSON.stringify(meta)
    }

    const updated = await db.conversation.update({
      where: { id },
      data: updateData,
    })

    // ── Section 15 — Human-escalation notification ──
    // We treat a conversation as "escalated to a human" when either:
    //   • the operator flips AI off (aiDisabled true), or
    //   • the operator manually assigns the conversation to themselves
    //     (assignedTo or assignedAgentId set to a user other than null).
    // The Inbox's "Transferir a humano" button posts to this same route,
    // so the operator-driven escalation flows through here too.
    const wasAiEnabled = !aiDisabled && (conversation.assignedTo == null && conversation.assignedAgentId == null)
    const isNowEscalated =
      (aiDisabled === true) ||
      (assignedTo && assignedTo !== null) ||
      (assignedAgentId && assignedAgentId !== null)
    if (wasAiEnabled && isNowEscalated) {
      try {
        // contactId is nullable in the Conversation model. When it is null
        // we still want the notification to fire, but the contactName has
        // to be derived from a different source.
        let contactName = 'Conversación sin contacto'
        if (conversation.contactId) {
          const contact = await db.contact.findUnique({
            where: { id: conversation.contactId },
            select: { firstName: true, lastName: true },
          })
          const name = `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim()
          if (name) contactName = name
        }
        // Build a short human-readable reason from the diff
        const reasons: string[] = []
        if (aiDisabled === true) reasons.push('IA desactivada manualmente')
        if (assignedTo) reasons.push('asignada a operador')
        if (assignedAgentId) reasons.push('asignada a agente')
        void notifyHumanEscalation(conversation.workspaceId, {
          contactName,
          reason: reasons.join(', ') || 'Transferencia manual',
          conversationId: conversation.id,
        })
      } catch (err) {
        console.warn('[conversations/PUT] human-escalation notify failed (non-critical):', err)
      }
    }

    return Response.json({ success: true, conversation: updated })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) {
      return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
    }
    const member = await requireWorkspace(conversation.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    // Soft-delete: set status to 'closed' and clear assignment
    await db.conversation.update({
      where: { id },
      data: {
        status: 'closed',
        assignedTo: null,
        assignedAgentId: null,
      },
    })

    return Response.json({ success: true, message: 'Conversación eliminada (cerrada)' })
  } catch (error) {
    return errorResponse(error)
  }
}
