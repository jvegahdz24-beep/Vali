import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/agents — List user's agents
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    const agents = await db.nexusAgent.findMany({
      where: { userId: session.userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    return Response.json({ agents })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/agents — Create custom agent
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { name, type, description, systemPrompt, personality, capabilities } = body

    if (!name) {
      return Response.json({ error: 'Nombre es requerido' }, { status: 400 })
    }

    const agent = await db.nexusAgent.create({
      data: {
        userId: session.userId,
        name,
        type: type || 'custom',
        description,
        systemPrompt: systemPrompt || '',
        personality: personality || 'professional',
        capabilities: JSON.stringify(capabilities || []),
      }
    })

    return Response.json({ agent }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
