// Plantillas de creativos guardadas (presets reutilizables).
// GET ?workspaceId  POST {workspaceId,name,kind,config}  DELETE ?id&workspaceId
// RBAC: crm.write para crear/borrar.

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const templates = await db.creativeTemplate.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } })
    return Response.json({ templates: templates.map((t) => ({ ...t, config: safe(t.config) })) })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, name, kind, config } = await req.json() as { workspaceId: string; name: string; kind?: string; config: unknown }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!name?.trim()) throw new ApiError(400, 'Ponle un nombre a la plantilla')
    const t = await db.creativeTemplate.create({ data: { workspaceId, name: name.trim().slice(0, 80), kind: kind === 'image' ? 'image' : 'video', config: JSON.stringify(config || {}) } })
    return Response.json({ success: true, template: { ...t, config: safe(t.config) } })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id') || ''
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    await db.creativeTemplate.deleteMany({ where: { id, workspaceId } })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}

function safe(s: string) { try { return JSON.parse(s) } catch { return {} } }
