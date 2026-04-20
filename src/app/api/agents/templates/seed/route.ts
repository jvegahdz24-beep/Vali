// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — POST /api/agents/templates/seed
// Load pre-built agent templates into a workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { agentTemplates } from '@/lib/agent-templates'
import { PERSONALITY_PROMPTS } from '@/lib/constants'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, templateIds, category } = body

    if (!workspaceId) {
      return Response.json(
        { error: 'workspaceId es requerido' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    // Filter templates to load
    let templatesToLoad = agentTemplates
    if (category && category !== 'all') {
      templatesToLoad = templatesToLoad.filter((t) => t.category === category)
    }
    if (templateIds && Array.isArray(templateIds) && templateIds.length > 0) {
      templatesToLoad = templatesToLoad.filter((t) => templateIds.includes(t.id))
    }

    if (templatesToLoad.length === 0) {
      return Response.json(
        { error: 'No se encontraron plantillas para cargar' },
        { status: 400 }
      )
    }

    // Get existing agents to avoid duplicates
    const existing = await db.agent.findMany({
      where: { workspaceId },
      select: { name: true },
    })
    const existingNames = new Set(existing.map((a) => a.name))

    // Create agents from templates (skip duplicates)
    const created = []
    const skipped = []

    for (const template of templatesToLoad) {
      if (existingNames.has(template.name)) {
        skipped.push(template.name)
        continue
      }

      // Get system prompt from personality, or use empty string
      const systemPrompt = PERSONALITY_PROMPTS[template.personality] || ''

      const agent = await db.agent.create({
        data: {
          workspaceId,
          name: template.name,
          description: template.description,
          type: template.type,
          model: template.model,
          modelName: template.modelName,
          temperature: template.temperature,
          maxTokens: template.maxTokens,
          systemPrompt,
          personality: template.personality,
          priority: template.priority,
          isActive: true,
          config: '{}',
        },
      })
      created.push(agent)
    }

    return Response.json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      skippedNames: skipped,
      message: `Se crearon ${created.length} agentes${skipped.length > 0 ? ` (${skipped.length} ya existían)` : ''}`,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
