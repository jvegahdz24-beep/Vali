// ═══════════════════════════════════════════════════════════════
// POST /api/copilot/chat — Copiloto IA (MiniMax). Body: { workspaceId,
// messages:[{role,content}] }. Ejecuta acciones de negocio y responde.
// GET  /api/copilot/chat?workspaceId= — disponibilidad (MiniMax key).
// RBAC: crm.write (puede ejecutar acciones).
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { runCopilot, type ChatMsg } from '@/lib/copilot/agent'
import { minimaxAvailable } from '@/lib/copilot/minimax-chat'

export const runtime = 'nodejs'
export const maxDuration = 180

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    await requireWorkspace(req.nextUrl.searchParams.get('workspaceId') || '', session.userId)
    return Response.json({ available: minimaxAvailable() })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, messages, stream } = await req.json() as { workspaceId: string; messages: ChatMsg[]; stream?: boolean }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!minimaxAvailable()) throw new ApiError(503, 'El Copiloto requiere configurar MINIMAX_API_KEY')
    if (!Array.isArray(messages) || !messages.length) throw new ApiError(400, 'Faltan mensajes')

    // ── Modo STREAMING (SSE): progreso en vivo por cada herramienta ──
    if (stream) {
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        start(controller) {
          const send = (obj: unknown) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch { /* stream cerrado */ } }
          // keep-alive cada 15s para que Cloudflare/proxy no corte por inactividad
          const ka = setInterval(() => { try { controller.enqueue(encoder.encode(': ka\n\n')) } catch { /* */ } }, 15000)
          runCopilot(messages, { workspaceId, base: baseUrl(req) }, (step) => send({ type: 'step', ...step }))
            .then((result) => send({ type: 'final', reply: result.reply, steps: result.steps }))
            .catch((e) => send({ type: 'error', error: e instanceof Error ? e.message : 'error' }))
            .finally(() => { clearInterval(ka); try { controller.close() } catch { /* */ } })
        },
      })
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } })
    }

    const result = await runCopilot(messages, { workspaceId, base: baseUrl(req) })
    return Response.json({ success: true, ...result })
  } catch (error) { return errorResponse(error) }
}
