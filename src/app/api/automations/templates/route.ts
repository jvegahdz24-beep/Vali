// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — GET /api/automations/templates
// List available pre-built automation templates
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { automationTemplates, templateCategories } from '@/lib/automation-templates'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    let templates = automationTemplates
    if (category && category !== 'all') {
      templates = templates.filter((t) => t.category === category)
    }

    return Response.json({
      templates,
      categories: templateCategories,
      total: templates.length,
    })
  } catch (error) {
    return Response.json(
      { error: 'Error al cargar plantillas' },
      { status: 500 }
    )
  }
}
