// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Niche Templates API
// GET  /api/templates — List available templates
// POST /api/templates — Apply a template to workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { getAvailableTemplates, applyTemplate } from '@/lib/crm/niche-templates'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET() {
  try {
    const templates = getAvailableTemplates()

    // Return templates without system prompts (too verbose for listing)
    const summarized = templates.map(t => ({
      id: t.id,
      name: t.name,
      industry: t.industry,
      description: t.description,
      pipelineStagesCount: t.pipelineStages.length,
      followUpTemplatesCount: t.followUpTemplates.length,
      highValueSignals: t.scoringRules.highValueSignals.length,
    }))

    return Response.json({ success: true, items: summarized })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, templateId } = body

    if (!workspaceId || !templateId) {
      return Response.json(
        { error: 'Missing required fields: workspaceId, templateId' },
        { status: 400 },
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    const result = await applyTemplate(workspaceId, templateId)

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 })
    }

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
