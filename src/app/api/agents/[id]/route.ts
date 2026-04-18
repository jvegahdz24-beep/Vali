// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Single Agent API
// PUT /api/agents/:id — Update agent
// DELETE /api/agents/:id — Delete agent
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req)
    const { id } = await params
    const body = await req.json()

    const existing = await db.agent.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    const {
      name,
      type,
      description,
      isActive,
      model,
      modelName,
      temperature,
      maxTokens,
      systemPrompt,
      personality,
      priority,
      config,
      webhookUrl,
    } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (type !== undefined) updateData.type = type
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive
    if (model !== undefined) updateData.model = model
    if (modelName !== undefined) updateData.modelName = modelName
    if (temperature !== undefined) updateData.temperature = temperature
    if (maxTokens !== undefined) updateData.maxTokens = maxTokens
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt
    if (personality !== undefined) updateData.personality = personality
    if (priority !== undefined) updateData.priority = priority
    if (config !== undefined) updateData.config = JSON.stringify(config)
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl

    const agent = await db.agent.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            logs: true,
            memories: true,
            followUpRules: true,
          },
        },
      },
    })

    return Response.json({ success: true, agent })
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

    const existing = await db.agent.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Delete agent and all related records
    await db.agent.delete({ where: { id } })

    return Response.json({ success: true, message: 'Agent deleted' })
  } catch (error) {
    return errorResponse(error)
  }
}
