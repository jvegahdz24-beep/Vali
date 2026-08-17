// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Marketing Automation Rules Endpoint
// GET    /api/marketing/automation?workspaceId=
// POST   /api/marketing/automation   { workspaceId, name, trigger, triggerValue, action, actionConfig, campaignId }
// PATCH  /api/marketing/automation   { id, workspaceId, ...updates }
// DELETE /api/marketing/automation?id=&workspaceId=
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

const VALID_TRIGGERS = ['pipeline_stage', 'temperature', 'tag', 'days_inactive']
const VALID_ACTIONS = ['send_whatsapp', 'generate_content', 'create_task']

// ─── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) return Response.json({ error: 'workspaceId requerido' }, { status: 400 })
    await requireWorkspace(workspaceId, session.userId)

    const automations = await db.marketingAutomation.findMany({
      where: { workspaceId },
      include: { campaign: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ automations })
  } catch (error) {
    return errorResponse(error)
  }
}

// ─── POST ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, name, trigger, triggerValue, action, actionConfig, campaignId } = body

    if (!workspaceId || !name || !trigger || !triggerValue || !action) {
      return Response.json({ error: 'workspaceId, name, trigger, triggerValue y action son requeridos' }, { status: 400 })
    }

    if (!VALID_TRIGGERS.includes(trigger)) {
      return Response.json({ error: `trigger debe ser uno de: ${VALID_TRIGGERS.join(', ')}` }, { status: 400 })
    }
    if (!VALID_ACTIONS.includes(action)) {
      return Response.json({ error: `action debe ser uno de: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const automation = await db.marketingAutomation.create({
      data: {
        workspaceId,
        name,
        trigger,
        triggerValue,
        action,
        actionConfig: typeof actionConfig === 'object' ? JSON.stringify(actionConfig) : (actionConfig || '{}'),
        campaignId: campaignId || null,
      },
      include: { campaign: { select: { id: true, name: true } } },
    })

    return Response.json({ automation }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

// ─── PATCH ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, workspaceId, name, trigger, triggerValue, action, actionConfig, campaignId, isActive } = body

    if (!id || !workspaceId) {
      return Response.json({ error: 'id y workspaceId requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.marketingAutomation.findFirst({ where: { id, workspaceId } })
    if (!existing) return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })

    if (trigger !== undefined && !VALID_TRIGGERS.includes(trigger)) {
      return Response.json({ error: `trigger debe ser uno de: ${VALID_TRIGGERS.join(', ')}` }, { status: 400 })
    }
    if (action !== undefined && !VALID_ACTIONS.includes(action)) {
      return Response.json({ error: `action debe ser uno de: ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }

    const updated = await db.marketingAutomation.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(trigger !== undefined && { trigger }),
        ...(triggerValue !== undefined && { triggerValue }),
        ...(action !== undefined && { action }),
        ...(actionConfig !== undefined && {
          actionConfig: typeof actionConfig === 'object' ? JSON.stringify(actionConfig) : actionConfig,
        }),
        ...(campaignId !== undefined && { campaignId: campaignId || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: { campaign: { select: { id: true, name: true } } },
    })

    return Response.json({ automation: updated })
  } catch (error) {
    return errorResponse(error)
  }
}

// ─── DELETE ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const workspaceId = searchParams.get('workspaceId')

    if (!id || !workspaceId) {
      return Response.json({ error: 'id y workspaceId requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.marketingAutomation.findFirst({ where: { id, workspaceId } })
    if (!existing) return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })

    await db.marketingAutomation.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
