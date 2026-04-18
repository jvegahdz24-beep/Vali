// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Conversations API
// GET /api/conversations — List conversations
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const channel = searchParams.get('channel') || undefined
    const status = searchParams.get('status') || undefined
    const contactId = searchParams.get('contactId') || undefined
    const assignedTo = searchParams.get('assignedTo') || undefined
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100)

    const where: Record<string, unknown> = {
      workspaceId,
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(contactId ? { contactId } : {}),
      ...(assignedTo ? { assignedTo } : {}),
    }

    const [conversations, total] = await Promise.all([
      db.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
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
            },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      db.conversation.count({ where }),
    ])

    // Defensive: ensure contact is never null to prevent client-side crashes
    const safeConversations = conversations.map(conv => ({
      ...conv,
      contact: conv.contact || {
        id: '',
        firstName: 'Sin',
        lastName: 'contacto',
        phone: '',
        email: '',
        avatar: null,
        leadScore: 0,
      },
    }))

    return Response.json({
      items: safeConversations,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
