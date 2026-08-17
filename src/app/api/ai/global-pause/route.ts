// ═══════════════════════════════════════════════════════════════
// Switch GLOBAL de la IA del workspace (atajos del tablero).
// GET  ?workspaceId=            — estado {paused, until}
// POST {workspaceId, mode}      — '1h' | '3h' | 'off' (indefinido) | 'on' (reactivar)
// El bot deja de responder a TODOS los contactos mientras esté en pausa;
// los mensajes entrantes se siguen guardando en el CRM. Con '1h'/'3h' la IA
// se reactiva sola al vencer (message-processor limpia la bandera).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

async function readState(workspaceId: string) {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
  const until = s.aiGlobalPausedUntil ? new Date(String(s.aiGlobalPausedUntil)) : null
  const untilActive = !!(until && !isNaN(until.getTime()) && until.getTime() > Date.now())
  return {
    settings: s,
    paused: s.aiGlobalPaused === true || untilActive,
    until: untilActive ? until!.toISOString() : null,
    indefinite: s.aiGlobalPaused === true && !untilActive,
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const st = await readState(workspaceId)
    return Response.json({ paused: st.paused, until: st.until, indefinite: st.indefinite })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; mode: '1h' | '3h' | 'off' | 'on' }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const st = await readState(body.workspaceId)
    const s = st.settings
    if (body.mode === 'on') {
      s.aiGlobalPaused = false
      delete s.aiGlobalPausedUntil
    } else if (body.mode === 'off') {
      s.aiGlobalPaused = true
      delete s.aiGlobalPausedUntil
    } else {
      const hours = body.mode === '3h' ? 3 : 1
      s.aiGlobalPaused = false
      s.aiGlobalPausedUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString()
    }
    await db.workspace.update({ where: { id: body.workspaceId }, data: { settings: JSON.stringify(s) } })
    const after = await readState(body.workspaceId)
    console.log(`[GlobalPause] ws ${body.workspaceId} → mode=${body.mode} paused=${after.paused} until=${after.until || '—'} (por ${session.userId})`)
    return Response.json({ success: true, paused: after.paused, until: after.until, indefinite: after.indefinite })
  } catch (error) { return errorResponse(error) }
}
