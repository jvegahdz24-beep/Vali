// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — gBrain Agent Factory: Instance detail API
// PATCH  /api/agent-factory/instances/:id  — edita / pausa / reanuda un agente
// DELETE /api/agent-factory/instances/:id?workspaceId=  — elimina un agente
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { invalidateAgentInstanceCache } from '@/lib/ai/agent-selector'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await ctx.params
    const body = await req.json() as {
      workspaceId: string
      name?: string
      role?: string
      scope?: string
      systemPrompt?: string
      tools?: string[]
      keywords?: string[]
      stageMatch?: string[]
      forbiddenActions?: string[]
      model?: string
      temperature?: number
      priority?: number
      status?: string
    }
    await requireWorkspace(body.workspaceId, session.userId)

    const existing = await db.agentInstance.findUnique({ where: { id } })
    if (!existing || existing.workspaceId !== body.workspaceId) {
      return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.role !== undefined) data.role = body.role
    if (body.scope !== undefined) data.scope = body.scope
    if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt
    if (body.tools !== undefined) data.tools = JSON.stringify(body.tools)
    if (body.keywords !== undefined) data.keywords = JSON.stringify(body.keywords)
    if (body.stageMatch !== undefined) data.stageMatch = JSON.stringify(body.stageMatch)
    if (body.forbiddenActions !== undefined) data.forbiddenActions = JSON.stringify(body.forbiddenActions)
    if (body.model !== undefined) data.model = body.model
    if (body.temperature !== undefined) data.temperature = body.temperature
    if (body.priority !== undefined) data.priority = body.priority
    if (body.status !== undefined) data.status = body.status

    await db.agentInstance.update({ where: { id }, data })
    invalidateAgentInstanceCache(body.workspaceId)
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

    const existing = await db.agentInstance.findUnique({ where: { id } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
    }

    await db.agentInstance.delete({ where: { id } })
    invalidateAgentInstanceCache(workspaceId!)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
