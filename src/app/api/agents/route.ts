// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Agents API
// GET /api/agents — List agents
// POST /api/agents — Create agent
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

    const type = searchParams.get('type') || undefined
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: Record<string, unknown> = {
      workspaceId,
      ...(type ? { type } : {}),
      ...(!includeInactive ? { isActive: true } : {}),
    }

    const agents = await db.agent.findMany({
      where,
      include: {
        _count: {
          select: {
            logs: true,
            memories: true,
            followUpRules: true,
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })

    return Response.json({ items: agents })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const {
      workspaceId,
      name,
      type = 'qualifier',
      description,
      model = 'groq',
      modelName = 'llama-3.3-70b-versatile',
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt,
      personality = 'JHON',
      priority = 0,
      config,
      webhookUrl,
    } = body

    await requireWorkspace(workspaceId, session.userId)

    if (!name) {
      return Response.json(
        { error: 'Missing required fields: name' },
        { status: 400 }
      )
    }

    const agent = await db.agent.create({
      data: {
        workspaceId,
        name,
        type,
        description: description || null,
        model,
        modelName,
        temperature,
        maxTokens,
        systemPrompt: systemPrompt || '',
        personality,
        priority,
        config: JSON.stringify(config || {}),
        webhookUrl: webhookUrl || null,
      },
    })

    return Response.json({ success: true, agent }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
