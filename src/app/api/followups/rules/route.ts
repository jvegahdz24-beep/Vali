// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Reglas de seguimiento (FollowUpRule) por inactividad.
// GET    /api/followups/rules?workspaceId=        → lista reglas + dry-run de a quién dispararían
// POST   /api/followups/rules                     → crea regla { name, days, messageTemplate }
// PATCH  /api/followups/rules { id, ... }          → edita (incl. isActive)
// DELETE /api/followups/rules?id=&workspaceId=     → elimina
// RBAC: crm.write. El evaluador (lib/ai/inactivity-rules) corre en el cron solo
// si el workspace activó el seguimiento automático (settings.autoReactivation).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { evaluateInactivityRules } from '@/lib/ai/inactivity-rules'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const rules = await db.followUpRule.findMany({
      where: { workspaceId, triggerType: 'inactivity' },
      orderBy: { createdAt: 'desc' },
    })
    const preview = await evaluateInactivityRules(workspaceId, { dryRun: true })
    return Response.json({
      rules: rules.map((r) => {
        let days = 7; try { days = JSON.parse(r.triggerConfig || '{}').days || 7 } catch { /* */ }
        return { id: r.id, name: r.name, days, messageTemplate: r.messageTemplate, isActive: r.isActive, cooldownHours: r.cooldownHours }
      }),
      previewCount: preview.length,
      preview: preview.slice(0, 15),
    })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; name: string; days: number; messageTemplate: string; cooldownHours?: number }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    // El mensaje puede ir VACÍO: en ese caso la IA redacta uno PERSONALIZADO
    // según la conversación real de cada lead (no plantilla fija).
    if (!body.name?.trim()) throw new ApiError(400, 'Falta el nombre de la regla')
    const days = Math.max(1, Math.min(Number(body.days) || 7, 365))
    const created = await db.followUpRule.create({
      data: {
        workspaceId: body.workspaceId,
        name: body.name.trim(),
        triggerType: 'inactivity',
        triggerConfig: JSON.stringify({ days }),
        messageTemplate: (body.messageTemplate || '').trim().slice(0, 2000),
        cooldownHours: Math.max(6, Math.min(Number(body.cooldownHours) || 48, 720)),
        isActive: true,
      },
    })
    return Response.json({ success: true, id: created.id })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; id: string; name?: string; days?: number; messageTemplate?: string; isActive?: boolean; cooldownHours?: number }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    const rule = await db.followUpRule.findFirst({ where: { id: body.id, workspaceId: body.workspaceId } })
    if (!rule) throw new ApiError(404, 'Regla no encontrada')
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') data.name = body.name.trim()
    if (typeof body.messageTemplate === 'string') data.messageTemplate = body.messageTemplate.trim().slice(0, 2000)
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive
    if (typeof body.cooldownHours === 'number') data.cooldownHours = Math.max(6, Math.min(body.cooldownHours, 720))
    if (typeof body.days === 'number') data.triggerConfig = JSON.stringify({ days: Math.max(1, Math.min(body.days, 120)) })
    await db.followUpRule.update({ where: { id: body.id }, data })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    const id = req.nextUrl.searchParams.get('id') || ''
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    await db.followUpRule.deleteMany({ where: { id, workspaceId } })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
