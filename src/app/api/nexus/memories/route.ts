import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/memories — List all memories
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const memories = await db.nexusMemory.findMany({
      where: {
        userId: session.userId,
        ...(category && category !== 'all' ? { category } : {}),
      },
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
    const { key, value, category, importance } = body

    if (!key || !value) {
      return Response.json({ error: 'Key y value son requeridos' }, { status: 400 })
    }

    const memory = await db.nexusMemory.upsert({
      where: {
        userId_key: { userId: session.userId, key }
      },
      create: {
        userId: session.userId,
        key,
        value,
        category: category || 'general',
        importance: importance || 5,
        source: 'manual',
      },
      update: {
        value,
        category: category || 'general',
        importance: importance || 5,
        lastAccessed: new Date(),
        accessCount: { increment: 1 },
      }
    })

    return Response.json({ memory })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/nexus/memories — Delete a memory
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return Response.json({ error: 'Key es requerido' }, { status: 400 })
    }

    await db.nexusMemory.delete({
      where: {
        userId_key: { userId: session.userId, key }
      }
    })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
