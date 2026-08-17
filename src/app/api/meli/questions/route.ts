// GET  /api/meli/questions?workspaceId=&status=UNANSWERED — preguntas de compradores
// POST /api/meli/questions  { workspaceId, questionId, text } — responder
// RBAC: GET membresía; POST crm.write.
import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { loadConnection, meliApi } from '@/lib/meli/client'
import { logMeli } from '@/lib/meli/log'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')!
    await requireWorkspace(workspaceId, session.userId)
    const conn = await loadConnection(workspaceId)
    if (!conn || conn.status !== 'connected') return Response.json({ questions: [], connected: false })
    const status = searchParams.get('status') || 'UNANSWERED'
    const data = await meliApi.questions(conn, status) as { questions?: unknown[] }
    return Response.json({ connected: true, questions: data.questions || [] })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, questionId, text } = await req.json() as { workspaceId: string; questionId: string; text: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!text?.trim()) throw new ApiError(400, 'Escribe la respuesta')
    const conn = await loadConnection(workspaceId)
    if (!conn || conn.status !== 'connected') throw new ApiError(400, 'Mercado Libre no conectado')
    try {
      await meliApi.answer(conn, String(questionId), text.trim())
      await logMeli(workspaceId, 'answer', { targetType: 'question', targetId: String(questionId), status: 'ok', message: text.trim().slice(0, 120) })
      return Response.json({ success: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al responder'
      await logMeli(workspaceId, 'answer', { targetType: 'question', targetId: String(questionId), status: 'error', message: msg })
      throw new ApiError(422, msg)
    }
  } catch (error) { return errorResponse(error) }
}
