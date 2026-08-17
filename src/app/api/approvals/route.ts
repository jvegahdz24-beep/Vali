// ═══════════════════════════════════════════════════════════════
// Aprobación humana de acciones críticas (Verificación/Control)
// GET  /api/approvals?workspaceId=&status=pending  — lista
// POST /api/approvals  { id, action: 'approve'|'reject' }
//   approve → ejecuta la acción retenida (pago/factura) y, si aplica, envía
//   el link al cliente por WhatsApp. reject → marca rechazada.
// La lógica de ejecución vive en lib/erp/approvals.ts (compartida con el
// Copiloto IA, que también puede aprobar/rechazar por lenguaje natural).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { resolveApproval } from '@/lib/erp/approvals'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    const status = req.nextUrl.searchParams.get('status') || 'pending'
    await requireWorkspace(workspaceId, session.userId)
    const approvals = await db.pendingApproval.findMany({
      where: { workspaceId, ...(status === 'all' ? {} : { status }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ success: true, approvals })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { id, action } = await req.json()
    const appr = await db.pendingApproval.findUnique({ where: { id } })
    if (!appr) return NextResponse.json({ error: 'Aprobación no encontrada' }, { status: 404 })
    await requireWorkspace(appr.workspaceId, session.userId)
    if (appr.status !== 'pending') return NextResponse.json({ error: 'Ya fue resuelta' }, { status: 409 })
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action debe ser approve|reject' }, { status: 400 })
    }

    const r = await resolveApproval({ id, action, resolvedBy: session.userId })
    if (r.error) return NextResponse.json({ error: r.error }, { status: 409 })
    const updated = await db.pendingApproval.findUnique({ where: { id } })
    return NextResponse.json({ success: true, status: r.status, resultNote: r.resultNote, approval: updated })
  } catch (error) {
    return errorResponse(error)
  }
}
