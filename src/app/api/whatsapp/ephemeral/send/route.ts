// POST /api/whatsapp/ephemeral/send — Send via ephemeral client
import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { getClientIp } from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }
    const ip = getClientIp(req)
    const rl = rateLimit(`${ip}:ephemeral:send`, RATE_LIMITS.whatsappSend.limit, RATE_LIMITS.whatsappSend.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiados mensajes.', code: 'RATE_LIMITED' }, { status: 429 })
    }

    const body = await req.json()
    const { phone, message, clientId, workspaceId, conversationId, contactId } = body
    if (!phone || !message) {
      return NextResponse.json({ error: 'phone y message son requeridos', code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    if (workspaceId && workspaceId !== session.workspaceId) {
      return NextResponse.json({ error: 'Workspace mismatch', code: 'FORBIDDEN' }, { status: 403 })
    }

    const manager = getWhatsAppManager(session.workspaceId)
    let result: { success: boolean; id?: string; error?: string; source?: string }

    if (clientId) {
      const client = ephemeralManager.get(clientId)
      if (!client || !client.isConnected()) {
        return NextResponse.json({ error: 'Sesion efimera no conectada', code: 'NOT_CONNECTED' }, { status: 503 })
      }
      const r = await client.send(phone, message)
      result = { ...r, source: `ephemeral:${clientId}` }
    } else {
      result = await ephemeralManager.sendAny(phone, message, (p, t) => manager.sendMessage(p, t))
    }

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 503 })
    }

    if (conversationId && workspaceId) {
      try {
        await db.message.create({
          data: { conversationId, content: message, type: 'text', direction: 'outbound', senderType: 'agent', externalId: result.id || undefined, metadata: JSON.stringify({ source: result.source }) },
        })
        await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), lastMessagePreview: message.slice(0, 100) } })
        if (contactId) await db.contact.update({ where: { id: contactId }, data: { lastMessageAt: new Date() } })
      } catch (e) { console.error('[Ephemeral Send] DB error (msg still sent):', e) }
    }

    return NextResponse.json({ success: true, messageId: result.id, phone, source: result.source })
  } catch (error) {
    return errorResponse(error, 'Error al enviar mensaje')
  }
}
