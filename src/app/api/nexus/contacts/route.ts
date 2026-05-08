import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/contacts — List contacts for current user
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const relation = searchParams.get('relation')

    const where: Record<string, unknown> = { userId: session.userId }
    if (relation) {
      where.relation = relation
    }

    const contacts = await db.nexusContact.findMany({
      where,
      orderBy: [{ isFavorite: 'desc' }, { name: 'asc' }],
    })

    return Response.json({ contacts })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/contacts — Create a new contact
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()

    if (!body.name?.trim()) {
      return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const contact = await db.nexusContact.create({
      data: {
        userId: session.userId,
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        relation: body.relation || 'amigo',
        company: body.company?.trim() || null,
        role: body.role?.trim() || null,
        birthday: body.birthday?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    })

    return Response.json({ contact })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/nexus/contacts?id=xxx — Delete a contact
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }

    await db.nexusContact.deleteMany({
      where: { id, userId: session.userId },
    })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
