// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Contacts Bulk Operations API
// POST /api/contacts/bulk   — Delete selected contacts (hard delete)
// DELETE /api/contacts/bulk — Delete ALL contacts in workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

/**
 * POST /api/contacts/bulk — Delete selected contacts permanently
 * Body: { workspaceId: string, contactIds: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, contactIds } = body as {
      workspaceId?: string
      contactIds?: string[]
    }

    if (!workspaceId) {
      return Response.json(
        { error: 'workspaceId es requerido' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json(
        { error: 'contactIds debe ser un arreglo no vacío' },
        { status: 400 }
      )
    }

    // Delete related records first, then contacts
    // 1. Get all conversation IDs linked to these contacts
    const conversations = await db.conversation.findMany({
      where: { contactId: { in: contactIds } },
      select: { id: true },
    })
    const conversationIds = conversations.map((c) => c.id)

    // 2. Delete agent logs for these conversations
    if (conversationIds.length > 0) {
      await db.agentLog.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
    }

    // 3. Delete messages for these conversations
    if (conversationIds.length > 0) {
      await db.message.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
    }

    // 4. Delete the conversations themselves
    await db.conversation.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 5. Delete deals linked to these contacts
    await db.deal.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 6. Delete agent memories linked to these contacts
    await db.agentMemory.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 7. Delete follow-up tasks linked to these contacts
    await db.followUpTask.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 8. Finally, delete the contacts
    const result = await db.contact.deleteMany({
      where: {
        id: { in: contactIds },
        workspaceId,
      },
    })

    return Response.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * DELETE /api/contacts/bulk — Delete ALL contacts in workspace
 * Query: ?workspaceId=xxx
 * Header: x-confirm-delete-all: "true" (required to prevent accidental calls)
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return Response.json(
        { error: 'workspaceId es requerido' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    // Require confirmation header
    const confirmHeader = req.headers.get('x-confirm-delete-all')
    if (confirmHeader !== 'true') {
      return Response.json(
        {
          error:
            'Para eliminar todos los contactos, envía el header "x-confirm-delete-all: true"',
        },
        { status: 400 }
      )
    }

    // Get all contact IDs in this workspace
    const contactsToDelete = await db.contact.findMany({
      where: { workspaceId },
      select: { id: true },
    })
    const contactIds = contactsToDelete.map((c) => c.id)

    if (contactIds.length === 0) {
      return Response.json({
        success: true,
        deleted: 0,
      })
    }

    // Delete related records first
    // 1. Get all conversation IDs linked to workspace contacts
    const conversations = await db.conversation.findMany({
      where: { contactId: { in: contactIds } },
      select: { id: true },
    })
    const conversationIds = conversations.map((c) => c.id)

    // 2. Delete agent logs for these conversations
    if (conversationIds.length > 0) {
      await db.agentLog.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
    }

    // 3. Delete messages for these conversations
    if (conversationIds.length > 0) {
      await db.message.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
    }

    // 4. Delete the conversations themselves
    await db.conversation.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 5. Delete deals linked to these contacts
    await db.deal.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 6. Delete agent memories linked to these contacts
    await db.agentMemory.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 7. Delete follow-up tasks linked to these contacts
    await db.followUpTask.deleteMany({
      where: { contactId: { in: contactIds } },
    })

    // 8. Delete all contacts in workspace
    const result = await db.contact.deleteMany({
      where: { workspaceId },
    })

    return Response.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
