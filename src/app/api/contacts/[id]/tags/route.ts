// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Contact Tags API
// POST   /api/contacts/[id]/tags  — add a tag to contact
// DELETE /api/contacts/[id]/tags  — remove a tag from contact
// Body: { tag: string }
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

async function getContact(id: string, userId: string) {
  const contact = await db.contact.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, tags: true },
  })
  if (!contact) return null
  await requireWorkspace(contact.workspaceId, userId)
  return contact
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const { tag } = await req.json() as { tag?: string }

    if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
      return Response.json({ error: 'tag is required' }, { status: 400 })
    }

    const contact = await getContact(id, session.userId)
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

    const currentTags: string[] = JSON.parse(contact.tags || '[]')
    const normalizedTag = tag.trim().toLowerCase()

    if (currentTags.includes(normalizedTag)) {
      return Response.json({ tags: currentTags }) // idempotent
    }

    const newTags = [...currentTags, normalizedTag]
    const updated = await db.contact.update({
      where: { id },
      data: { tags: JSON.stringify(newTags) },
      select: { id: true, tags: true },
    })

    return Response.json({ tags: JSON.parse(updated.tags || '[]') })
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
    const { tag } = await req.json() as { tag?: string }

    if (!tag || typeof tag !== 'string') {
      return Response.json({ error: 'tag is required' }, { status: 400 })
    }

    const contact = await getContact(id, session.userId)
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

    const currentTags: string[] = JSON.parse(contact.tags || '[]')
    const normalizedTag = tag.trim().toLowerCase()
    const newTags = currentTags.filter((t) => t !== normalizedTag)

    const updated = await db.contact.update({
      where: { id },
      data: { tags: JSON.stringify(newTags) },
      select: { id: true, tags: true },
    })

    return Response.json({ tags: JSON.parse(updated.tags || '[]') })
  } catch (error) {
    return errorResponse(error)
  }
}
