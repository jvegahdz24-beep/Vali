// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — API keys de transcripción/visión por workspace.
// Permite a cada cliente pegar su key de Groq u OpenAI para que el bot
// transcriba notas de voz (y use visión de respaldo). Se guarda en
// settings.apiKeys.{groq,openai}. GET devuelve solo si están seteadas (no la key).
// RBAC: settings.manage.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'

function parse(json: string | null | undefined): Record<string, unknown> {
  try { return JSON.parse(json || '{}') as Record<string, unknown> } catch { return {} }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const ak = (parse(ws?.settings).apiKeys as Record<string, string>) || {}
    const mask = (k?: string) => (k && k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k ? '••••' : '')
    return Response.json({
      groqSet: !!ak.groq, openaiSet: !!ak.openai,
      groqMasked: mask(ak.groq), openaiMasked: mask(ak.openai),
      // visión por MiniMax (plataforma) siempre disponible; audio depende de estas keys
      audioEnabled: !!(ak.groq || ak.openai || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; groq?: string; openai?: string }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'settings.manage')

    const ws = await db.workspace.findUnique({ where: { id: body.workspaceId }, select: { settings: true } })
    if (!ws) throw new ApiError(404, 'Workspace no encontrado')
    const s = parse(ws.settings)
    const apiKeys = (s.apiKeys as Record<string, string>) || {}
    // Solo actualiza si viene un valor; '' explícito borra; undefined no toca.
    if (typeof body.groq === 'string') { if (body.groq.trim()) apiKeys.groq = body.groq.trim(); else delete apiKeys.groq }
    if (typeof body.openai === 'string') { if (body.openai.trim()) apiKeys.openai = body.openai.trim(); else delete apiKeys.openai }
    s.apiKeys = apiKeys
    await db.workspace.update({ where: { id: body.workspaceId }, data: { settings: JSON.stringify(s) } })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
