// ═══════════════════════════════════════════════════════════════
// Estatus de inventario personalizados (pedido de Jhon 2026-07-28).
// GET  /api/inventory/statuses?workspaceId=  → { statuses } (fábrica + custom)
// POST /api/inventory/statuses { workspaceId, statuses:[{label,color,visibleToClient,roles}] }
//   → guarda los personalizados en Workspace.settings.inventoryStatuses (SIN migración)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { allStatuses, normalizeStatusDef, BUILTIN_STATUSES, type StatusDef } from '@/lib/inventory-visibility'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = new URL(req.url).searchParams.get('workspaceId')
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId requerido' }, { status: 400 })
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    return NextResponse.json({ statuses: allStatuses(ws?.settings) })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId?: string; statuses?: unknown[] }
    const workspaceId = body.workspaceId
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId requerido' }, { status: 400 })
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    // Normaliza y descarta lo que colisione con un estatus de fábrica o se duplique.
    const builtinKeys = new Set(BUILTIN_STATUSES.map(b => b.key))
    const seen = new Set(builtinKeys)
    const custom: StatusDef[] = []
    for (const raw of Array.isArray(body.statuses) ? body.statuses : []) {
      const def = normalizeStatusDef(raw)
      if (!def || seen.has(def.key)) continue
      seen.add(def.key)
      custom.push(def)
    }
    if (custom.length > 40) custom.length = 40 // tope sano

    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(ws?.settings || '{}') } catch { settings = {} }
    settings.inventoryStatuses = custom
    await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(settings) } })

    return NextResponse.json({ statuses: [...BUILTIN_STATUSES, ...custom] })
  } catch (err) {
    return errorResponse(err)
  }
}
