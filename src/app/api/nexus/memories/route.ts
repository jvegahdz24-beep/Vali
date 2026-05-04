import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/memories — List all memories
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const contactId = searchParams.get('contactId')
    const workspaceId = searchParams.get('workspaceId') || undefined
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {
      userId: session.userId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(category && category !== 'all' ? { category } : {}),
      ...(contactId ? { contactId } : {}),
      // If workspaceId is provided, scope NEXUS memories to that workspace
      ...(workspaceId ? { workspaceId } : {}),
    }

    // Simple text search via value/key filter
    if (search) {
      where.OR = [
        { key: { contains: search } },
        { value: { contains: search } },
      ]
    }

    const memories = await db.nexusMemory.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    })

    return Response.json({ memories })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/memories — Create or update memory
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { key, value, category, importance, contactId, tags, source, workspaceId } = body

    if (!key || !value) {
      return Response.json({ error: 'Key y value son requeridos' }, { status: 400 })
    }

    const validCategories = ['conversational', 'commercial', 'emotional', 'behavioral', 'preference', 'fact', 'instruction', 'context']
    const memCategory = validCategories.includes(category) ? category : 'conversational'

    const memory = await db.nexusMemory.upsert({
      where: {
        userId_key: { userId: session.userId, key }
      },
      create: {
        userId: session.userId,
        workspaceId: workspaceId || null,
        key,
        value,
        category: memCategory,
        importance: importance || 5,
        source: source || 'manual',
        contactId: contactId || null,
        tags: tags ? JSON.stringify(tags) : '[]',
        lastReinforcedAt: new Date(),
      },
      update: {
        value,
        category: memCategory,
        importance: importance || 5,
        lastAccessed: new Date(),
        lastReinforcedAt: new Date(),
        accessCount: { increment: 1 },
        status: 'active',
        ...(tags ? { tags: JSON.stringify(tags) } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      }
    })

    return Response.json({ memory })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/nexus/memories — Delete (archive) a memory
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    const id = searchParams.get('id')

    if (id) {
      // Archive by ID
      const memory = await db.nexusMemory.findUnique({ where: { id } })
      if (!memory || memory.userId !== session.userId) {
        return Response.json({ error: 'Memoria no encontrada' }, { status: 404 })
      }
      await db.nexusMemory.update({
        where: { id },
        data: { status: 'archived' },
      })
      return Response.json({ success: true })
    }

    if (key) {
      // Archive by key
      await db.nexusMemory.updateMany({
        where: {
          userId: session.userId,
          key,
        },
        data: { status: 'archived' },
      })
      return Response.json({ success: true })
    }

    return Response.json({ error: 'Key o ID requerido' }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}
