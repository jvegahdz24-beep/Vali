import { NextRequest, NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { db } from '@/lib/db'
import { validateBody, whatsappSendSchema } from '@/lib/validations'
import { requireAuth, requireWorkspace, errorResponse, getClientIp } from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)

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

    // Verify workspace access before sending
    if (workspaceId) {
      await requireWorkspace(workspaceId, session.userId)
    }

    const result = await whatsAppManager.sendMessage(phone, message)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Error al enviar mensaje' }, { status: 503 })
    }

    if (conversationId && workspaceId) {
      try {
        await db.message.create({
          data: {
            conversationId,
            content: message,
            type: 'text',
            direction: 'outbound',
            senderType: 'human',
            externalId: result.id || undefined,
          },
        })

        await db.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date(), lastMessagePreview: message.slice(0, 100) },
        })

        if (contactId) {
          await db.contact.update({
            where: { id: contactId },
            data: { lastMessageAt: new Date() },
          })
        }
      } catch (dbError) {
        console.error('[WhatsApp Send] DB save error (message was still sent):', dbError)
      }
    }

    return NextResponse.json({ success: true, messageId: result.id, phone, message })
  } catch (error) {
    return errorResponse(error, 'Error al enviar mensaje')
  }
}
