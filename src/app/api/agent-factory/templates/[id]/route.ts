// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — gBrain Agent Factory: Template detail API
// PUT    /api/agent-factory/templates/:id?workspaceId=  — edita una plantilla custom
// DELETE /api/agent-factory/templates/:id?workspaceId=  — elimina una plantilla custom
// (Las plantillas del registry son solo lectura; para editarlas, clónalas con POST.)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await ctx.params
    const body = await req.json() as {
      workspaceId: string
      name?: string
      vertical?: string
      description?: string
      systemPrompt?: string
      tools?: string[]
      qualityChecklist?: string[]
      humanApprovalGates?: string[]
      forbiddenActions?: string[]
      keywords?: string[]
    }
    await requireWorkspace(body.workspaceId, session.userId)

    const existing = await db.agentTemplate.findUnique({ where: { id } })
    if (!existing || existing.workspaceId !== body.workspaceId) {
      return NextResponse.json({ error: 'Plantilla no encontrada o no editable' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.vertical !== undefined) data.vertical = body.vertical
    if (body.description !== undefined) data.description = body.description
    if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt
    if (body.tools !== undefined) data.tools = JSON.stringify(body.tools)
    if (body.qualityChecklist !== undefined) data.qualityChecklist = JSON.stringify(body.qualityChecklist)
    if (body.humanApprovalGates !== undefined) data.humanApprovalGates = JSON.stringify(body.humanApprovalGates)
    if (body.forbiddenActions !== undefined) data.forbiddenActions = JSON.stringify(body.forbiddenActions)
    if (body.keywords !== undefined) data.keywords = JSON.stringify(body.keywords)

    await db.agentTemplate.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await ctx.params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const existing = await db.agentTemplate.findUnique({ where: { id } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Plantilla no encontrada o no editable' }, { status: 404 })
    }

    await db.agentTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
