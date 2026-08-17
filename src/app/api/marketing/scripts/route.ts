// Guiones guardados (reutilizables en videos).
// GET ?workspaceId  POST {workspaceId,name,content,tone?,durationSec?}  DELETE ?id&workspaceId

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const scripts = await db.creativeScript.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } })
    return Response.json({ scripts })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, name, content, tone, durationSec } = await req.json() as { workspaceId: string; name: string; content: string; tone?: string; durationSec?: number }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!name?.trim() || !content?.trim()) throw new ApiError(400, 'Falta nombre o contenido del guión')
    const s = await db.creativeScript.create({ data: { workspaceId, name: name.trim().slice(0, 80), content: content.trim(), tone: tone || null, durationSec: durationSec || null } })
    return Response.json({ success: true, script: s })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const id = req.nextUrl.searchParams.get('id') || ''
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    await db.creativeScript.deleteMany({ where: { id, workspaceId } })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
