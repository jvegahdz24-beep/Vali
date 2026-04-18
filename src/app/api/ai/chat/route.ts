// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — AI Chat Endpoint
// POST /api/ai/chat — Frontend → Revenue Engine pipeline
//
// UNIFIED: This route is a FORWARDER only.
// All DB + AI logic lives in processMessageCore().
// This file only handles: auth + rate limit + parse request → core
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { processMessageCore } from '@/lib/ai/message-processor'
import { requireAuth, requireWorkspace, errorResponse, getClientIp } from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(req)
    const rl = rateLimit(`${ip}:ai:chat`, RATE_LIMITS.aiChat.limit, RATE_LIMITS.aiChat.windowMs)
    if (!rl.success) {
      return Response.json({ error: 'Demasiados intentos.', code: 'RATE_LIMITED' }, { status: 429 })
    }

    // Auth
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, conversationId, contactId, message, channel = 'whatsapp', contactData } = body

    if (!message) {
      return Response.json({ error: 'Missing required field: message' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    // ── FORWARD to processMessageCore (single source of truth) ──
    const result = await processMessageCore({
      text: message,
      phone: contactData?.phone || 'webchat_user',
      pushName: contactData?.firstName,
      channel,
      workspaceId,
      conversationId,
      contactId,
      skipMessageSave: false,
    })

    return Response.json({
      success: true,
      response: result.engineResult.response,
      analysis: {
        action: result.engineResult.action,
        strategy: result.engineResult.strategy,
        agentRouting: result.engineResult.agentRouting,
        followUpTasks: result.engineResult.followUpTasks,
        crmUpdates: result.engineResult.crmUpdates,
      },
      conversationId: result.conversationId,
      contactId: result.contactId,
      latencyMs: result.latencyMs,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
