// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Seguimiento automático (reactivación proactiva).
// GET   /api/followups/auto?workspaceId=        → estado + DRY-RUN (a quién escribiría, sin enviar)
// PATCH /api/followups/auto { enabled }         → activa/desactiva el auto-seguimiento (opt-in)
// POST  /api/followups/auto { run:true }        → reactiva AHORA (crea tareas; el worker las envía)
// RBAC: crm.write. Usa el ReactivationEngine existente (cooldown 24h, máx 4
// ciclos, salta aiDisabled/cerrados, cancela si hay cita) — solo lo expone.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { reactivationEngine } from '@/lib/ai/reactivation-engine'

function parse(json: string | null | undefined): Record<string, unknown> {
  try { return JSON.parse(json || '{}') as Record<string, unknown> } catch { return {} }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const s = parse(ws?.settings)
    const enabled = s.autoReactivation === true
    const approval = s.followUpApproval === 'telegram'

    // DRY-RUN: lista a quién escribiría AHORA, sin crear tareas ni enviar.
    const preview = await reactivationEngine.findAndReactivate(workspaceId, { dryRun: true })
    return Response.json({
      enabled,
      approval,
      previewCount: preview.length,
      preview: preview.slice(0, 20).map((r) => ({
        contactName: r.contactName, phone: r.phone, cycle: r.cycle, message: r.message,
      })),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; enabled?: boolean; approval?: boolean }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const ws = await db.workspace.findUnique({ where: { id: body.workspaceId }, select: { settings: true } })
    if (!ws) throw new ApiError(404, 'Workspace no encontrado')
    const s = parse(ws.settings)
    if (typeof body.enabled === 'boolean') s.autoReactivation = body.enabled === true
    // Modo "control total": aprobar cada follow-up desde Telegram antes de enviar.
    if (typeof body.approval === 'boolean') {
      if (body.approval) s.followUpApproval = 'telegram'
      else delete s.followUpApproval
    }
    await db.workspace.update({ where: { id: body.workspaceId }, data: { settings: JSON.stringify(s) } })
    return Response.json({ success: true, enabled: s.autoReactivation === true, approval: s.followUpApproval === 'telegram' })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; run?: boolean }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!body.run) throw new ApiError(400, 'Falta run:true')

    // Reactivación REAL on-demand: crea las tareas; el worker (cron) las envía.
    const results = await reactivationEngine.findAndReactivate(body.workspaceId, { dryRun: false })
    return Response.json({ success: true, scheduled: results.length })
  } catch (error) {
    return errorResponse(error)
  }
}
