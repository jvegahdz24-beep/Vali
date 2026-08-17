// ═══════════════════════════════════════════════════════════════
// GET   /api/agent-factory/config?workspaceId= → estado del ruteo en vivo
// PATCH /api/agent-factory/config { workspaceId, enabled } → activa/desactiva
// El ruteo del Agent Factory está ON por defecto; solo se apaga si
// workspace.settings.agentFactoryEnabled === false. RBAC: agents.manage.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let enabled = true
    try { const s = JSON.parse(ws?.settings || '{}'); enabled = s.agentFactoryEnabled !== false } catch { /* default on */ }
    const active = await db.agentInstance.count({ where: { workspaceId, status: 'activo' } }).catch(() => 0)
    return Response.json({ enabled, activeInstances: active })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, enabled } = await req.json() as { workspaceId: string; enabled: boolean }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    s.agentFactoryEnabled = enabled !== false
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
    return Response.json({ success: true, enabled: s.agentFactoryEnabled })
  } catch (error) { return errorResponse(error) }
}
