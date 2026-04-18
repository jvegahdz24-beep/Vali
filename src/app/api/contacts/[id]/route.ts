// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Contact by ID API
// GET /api/contacts/[id] — Get contact
// PUT /api/contacts/[id] — Update contact
// DELETE /api/contacts/[id] — Soft-delete (archive) contact
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

    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            conversations: true,
            deals: true,
          },
        },
      },
    })

    if (!contact) {
      return Response.json({ error: 'Contact not found' }, { status: 404 })
    }

    return Response.json({ contact })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { firstName, lastName, phone, email, source, tags, notes, leadScore, status, customFields } = body

    const existing = await db.contact.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Check duplicate phone if changed
    if (phone && phone !== existing.phone) {
      const duplicate = await db.contact.findFirst({
        where: { workspaceId: existing.workspaceId, phone, status: { not: 'archived' }, id: { not: id } },
      })
      if (duplicate) {
        return Response.json({ error: 'Contact with this phone already exists' }, { status: 409 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email
    if (source !== undefined) updateData.source = source
    if (notes !== undefined) updateData.notes = notes
    if (leadScore !== undefined) updateData.leadScore = leadScore
    if (status !== undefined) updateData.status = status
    if (tags !== undefined) updateData.tags = JSON.stringify(tags)
    if (customFields !== undefined) updateData.customFields = JSON.stringify(customFields)

    const contact = await db.contact.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            conversations: true,
            deals: true,
          },
        },
      },
    })

    return Response.json({ success: true, contact })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req)
    const { id } = await params

    const existing = await db.contact.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Soft delete: set status to archived
    const contact = await db.contact.update({
      where: { id },
      data: { status: 'archived' },
    })

    return Response.json({ success: true, contact })
  } catch (error) {
    return errorResponse(error)
  }
}
