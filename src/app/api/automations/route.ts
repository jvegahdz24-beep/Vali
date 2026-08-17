// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automations API
// GET /api/automations — List automations
// POST /api/automations — Create automation
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const triggerType = searchParams.get('triggerType') || undefined
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: Record<string, unknown> = {
      workspaceId,
      ...(triggerType ? { triggerType } : {}),
      ...(!includeInactive ? { isActive: true } : {}),
    }

    const automations = await db.automation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({
      items: automations.map((a) => ({
        ...a,
        triggerConfig: JSON.parse(a.triggerConfig || '{}'),
        actions: JSON.parse(a.actions || '[]'),
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, name, description, triggerType, triggerConfig, actions, isActive = true } = body

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'automations.manage')

    if (!name || !triggerType) {
      return Response.json(
        { error: 'Missing required fields: name, triggerType' },
        { status: 400 }
      )
    }

    const automation = await db.automation.create({
      data: {
        workspaceId,
        name,
        description: description || null,
        triggerType,
        triggerConfig: JSON.stringify(triggerConfig || {}),
        actions: JSON.stringify(actions || []),
        isActive,
      },
    })

    return Response.json({ success: true, automation }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
