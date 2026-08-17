// ═══════════════════════════════════════════════════════════════
// Asignación de PLANTILLA de WhatsApp por ACCIÓN del sistema.
// GET  → settings.whatsappTemplateActions ({ accion: { name, language } })
// POST → guarda las asignaciones. RBAC: crm.write.
// Se usa para mensajes fuera de la ventana de 24h (business-initiated), que
// Meta exige que sean plantillas aprobadas.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    return Response.json({ assignments: (s.whatsappTemplateActions as Record<string, unknown>) || {} })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, assignments } = await req.json() as { workspaceId: string; assignments: Record<string, { name: string; language: string } | null> }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    // Limpia asignaciones nulas (des-asignar).
    const clean: Record<string, { name: string; language: string }> = {}
    for (const [k, v] of Object.entries(assignments || {})) { if (v && v.name) clean[k] = { name: v.name, language: v.language || 'es_MX' } }
    s.whatsappTemplateActions = clean
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
    return Response.json({ success: true, assignments: clean })
  } catch (error) { return errorResponse(error) }
}
