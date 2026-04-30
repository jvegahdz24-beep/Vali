// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automation by ID API
// GET /api/automations/[id] — Get automation
// PUT /api/automations/[id] — Update automation
// DELETE /api/automations/[id] — Delete automation
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const automation = await db.automation.findUnique({ where: { id } })
    if (!automation) {
      return Response.json({ error: 'Automation not found' }, { status: 404 })
    }

    await requireWorkspace(automation.workspaceId, session.userId)

    return Response.json({
      ...automation,
      triggerConfig: JSON.parse(automation.triggerConfig || '{}'),
      actions: JSON.parse(automation.actions || '[]'),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { name, description, triggerType, triggerConfig, actions, isActive } = body

    const existing = await db.automation.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Automation not found' }, { status: 404 })
    }

    await requireWorkspace(existing.workspaceId, session.userId)

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (triggerType !== undefined) updateData.triggerType = triggerType
    if (triggerConfig !== undefined) updateData.triggerConfig = JSON.stringify(triggerConfig)
    if (actions !== undefined) updateData.actions = JSON.stringify(actions)
    if (isActive !== undefined) updateData.isActive = isActive

    const automation = await db.automation.update({
      where: { id },
      data: updateData,
    })

    return Response.json({
      success: true,
      ...automation,
      triggerConfig: JSON.parse(automation.triggerConfig || '{}'),
      actions: JSON.parse(automation.actions || '[]'),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const existing = await db.automation.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Automation not found' }, { status: 404 })
    }

    await requireWorkspace(existing.workspaceId, session.userId)

    await db.automation.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
