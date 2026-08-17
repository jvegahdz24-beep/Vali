import { NextRequest, NextResponse } from 'next/server'
import { validateBody, whatsappSendSchema } from '@/lib/validations'
import { requireAuth, errorResponse, getClientIp } from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sendOperatorMessage } from '@/lib/whatsapp/operator-send'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }

    const ip = getClientIp(req)
    const rl = rateLimit(`${ip}:whatsapp:send`, RATE_LIMITS.whatsappSend.limit, RATE_LIMITS.whatsappSend.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiados mensajes. Intenta más tarde.', code: 'RATE_LIMITED' }, { status: 429 })
    }

    const body = await req.json()
    const validation = validateBody(whatsappSendSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { phone, message, workspaceId, conversationId, contactId } = validation.data

    // SECURITY: enforce that the workspaceId in the request body (if any)
    // matches the authenticated session — prevents cross-tenant sends.
    if (workspaceId && workspaceId !== session.workspaceId) {
      return NextResponse.json({ error: 'Workspace mismatch', code: 'FORBIDDEN' }, { status: 403 })
    }

    // conversationId is required so the message can be persisted into
    // the right thread. Refuse early with a clear 400 if missing.
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required', code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    // Routing is handled inside sendOperatorMessage:
    //   Workspace.waChannel === 'meta' → Meta Cloud API
    //   otherwise                       → Baileys (per-workspace manager)
    const result = await sendOperatorMessage({
      workspaceId: session.workspaceId,
      phone,
      message,
      conversationId,
      contactId: contactId ?? null,
    })

    if (!result.success) {
      // Channel send failed (Baileys disconnected, Meta 4xx, etc.)
      return NextResponse.json(
        { success: false, error: result.error || 'Error al enviar mensaje' },
        { status: 503 },
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      phone,
      message,
      delivered: result.delivered,
      persisted: result.persisted,
    })
  } catch (error) {
    return errorResponse(error, 'Error al enviar mensaje')
  }
}
