// ═══════════════════════════════════════════════════════════════
// Debug — inspecciona el prompt ensamblado y la respuesta cruda
// del último (o N) mensajes de IA de una conversación.
// Requiere que el workspace tenga settings.debugPrompts = true
// (si no, no hay datos capturados).
// GET /api/developer/debug-prompt/[conversationId]?workspaceId=...&limit=5
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const session = await requireAuth(request)
    const { conversationId } = await params
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') ?? ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20)
    await requireWorkspace(workspaceId, session.userId)

    // Ensure the conversation belongs to this workspace.
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true },
    })
    if (!conversation) throw new ApiError(404, 'Conversación no encontrada en este workspace')

    const logs = await db.agentLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        inputMessage: true,
        outputMessage: true,
        model: true,
        tokensUsed: true,
        latencyMs: true,
        intent: true,
        action: true,
        metadata: true,
        agent: { select: { name: true } },
      },
    })

    const entries = logs.map((l) => {
      let debug: unknown = null
      try {
        const meta = JSON.parse(l.metadata || '{}')
        debug = meta.debug ?? null
      } catch { /* ignore */ }
      return {
        id: l.id,
        createdAt: l.createdAt,
        agent: l.agent?.name ?? null,
        inputMessage: l.inputMessage,
        outputMessage: l.outputMessage,
        model: l.model,
        tokensUsed: l.tokensUsed,
        latencyMs: l.latencyMs,
        routedAgent: l.intent,
        action: l.action,
        debug, // { systemPrompt, analysisBlock, rawResponse } when debugPrompts is enabled
      }
    })

    const debugEnabled = entries.some((e) => e.debug)
    return NextResponse.json({
      success: true,
      conversationId,
      debugCaptureEnabled: debugEnabled,
      hint: debugEnabled
        ? undefined
        : 'No hay prompts capturados. Activa settings.debugPrompts = true en el workspace para capturar el prompt completo y la respuesta cruda de los próximos mensajes.',
      entries,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
