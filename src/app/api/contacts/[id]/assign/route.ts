// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Assign Agent to Contact
// PATCH /api/contacts/[id]/assign
// Body: { agentId: string | null }
// Assigns or unassigns an AI agent to a contact.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const { agentId } = await req.json() as { agentId?: string | null }

    const contact = await db.contact.findUnique({
      where: { id },
      select: { id: true, workspaceId: true, firstName: true, lastName: true },
    })
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

    await requireWorkspace(contact.workspaceId, session.userId)

    // Validate agent belongs to workspace (if assigning)
    if (agentId) {
      const agent = await db.agent.findFirst({
        where: { id: agentId, workspaceId: contact.workspaceId },
        select: { id: true, name: true },
      })
      if (!agent) {
        return Response.json({ error: 'Agent not found in this workspace' }, { status: 404 })
      }
    }

    // Update active conversations for this contact to assign the agent
    await db.conversation.updateMany({
      where: { contactId: id, workspaceId: contact.workspaceId, status: 'active' },
      data: { assignedAgentId: agentId ?? null },
    })

    return Response.json({
      success: true,
      contact: { id: contact.id, firstName: contact.firstName, lastName: contact.lastName },
      assigned: agentId ? true : false,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
