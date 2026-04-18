// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Single Conversation API
// GET /api/conversations/:id — Get conversation with messages
// POST /api/conversations/:id/messages — Send message
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req)
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100)

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
          },
        },
      },
    })

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Get messages with pagination
    const [messages, total] = await Promise.all([
      db.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
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
      }),
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
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
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
    await requireAuth(req)
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
