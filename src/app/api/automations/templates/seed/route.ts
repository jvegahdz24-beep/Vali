// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — POST /api/automations/templates/seed
// Load pre-built templates into a workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { automationTemplates } from '@/lib/automation-templates'

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
    let templatesToLoad = automationTemplates
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

    // Get existing automations to avoid duplicates
    const existing = await db.automation.findMany({
      where: { workspaceId },
      select: { name: true },
    })
    const existingNames = new Set(existing.map((a) => a.name))

    // Create automations from templates (skip duplicates)
    const created = []
    const skipped = []

    for (const template of templatesToLoad) {
      if (existingNames.has(template.name)) {
        skipped.push(template.name)
        continue
      }

      const automation = await db.automation.create({
        data: {
          workspaceId,
          name: template.name,
          description: template.description,
          triggerType: template.triggerType,
          triggerConfig: JSON.stringify(template.triggerConfig),
          actions: JSON.stringify(template.actions),
          isActive: true,
        },
      })
      created.push(automation)
    }

    return Response.json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      skippedNames: skipped,
      message: `Se cargaron ${created.length} plantillas${skipped.length > 0 ? ` (${skipped.length} ya existían)` : ''}`,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
