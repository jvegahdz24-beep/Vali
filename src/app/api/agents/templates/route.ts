// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — GET /api/agents/templates
// List available pre-built agent templates
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { agentTemplates, agentTemplateCategories } from '@/lib/agent-templates'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    let templates = agentTemplates
    if (category && category !== 'all') {
      templates = templates.filter((t) => t.category === category)
    }

    return Response.json({
      templates,
      categories: agentTemplateCategories,
      total: templates.length,
    })
  } catch (error) {
    return Response.json(
      { error: 'Error al cargar plantillas de agentes' },
      { status: 500 }
    )
  }
}
