// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — AI Chat Endpoint
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
    const {
      workspaceId,
      conversationId,
      contactId,
      message,
      channel = 'whatsapp',
      contactData,
      // When true, the `message` was typed by a human operator in the
      // inbox and has already been sent+persisted by /api/whatsapp/send.
      // The processor should run the AI pipeline (so the assistant can
      // produce its own reply) but must NOT save `message` as an
      // inbound message from the contact — otherwise the operator's
      // text shows up twice: once as outbound/human (correct) and once
      // as inbound/contact (the bug we are fixing).
      operatorInitiated = false,
    } = body

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
      operatorInitiated,
    })

    return Response.json({
      success: true,
      response: result.aiReplyText,
      analysis: {
        action: result.engineResult.action,
        strategy: result.engineResult.strategy,
        agentRouting: result.engineResult.agentRouting
          ? `${result.engineResult.agentRouting.agentType} (${Math.round(result.engineResult.agentRouting.confidence * 100)}%)`
          : undefined,
        followUpTasks: result.engineResult.followUpTasks?.map(
          (t) => `${t.channel} +${t.delayHours}h: ${t.template}`
        ) ?? [],
        crmUpdates: result.engineResult.crmUpdates?.map(
          (u) => `${u.type}: ${Array.isArray(u.value) ? u.value.join(', ') : u.value}`
        ) ?? [],
        crmTags: result.parsedCRMTags ?? [],
        apptMetadata: result.apptMetadata ?? null,
      },
      conversationId: result.conversationId,
      contactId: result.contactId,
      latencyMs: result.latencyMs,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
