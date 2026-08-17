// POST /api/whatsapp/ephemeral/send — Send via ephemeral client
import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { getClientIp } from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }
    await requireWorkspace(session.workspaceId, session.userId)
    const ip = getClientIp(req)
    const rl = rateLimit(`${session.userId}:${session.workspaceId}:${ip}:ephemeral:send`, RATE_LIMITS.whatsappSend.limit, RATE_LIMITS.whatsappSend.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiados mensajes.', code: 'RATE_LIMITED' }, { status: 429 })
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : undefined
    const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.trim() : ''
    const contactId = typeof body?.contactId === 'string' ? body.contactId.trim() : ''
    if (!/^\d{8,15}$/.test(phone) || !message || message.length > 4000) {
      return NextResponse.json({ error: 'phone o message inválidos', code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    if (workspaceId && workspaceId !== session.workspaceId) {
      return NextResponse.json({ error: 'Workspace mismatch', code: 'FORBIDDEN' }, { status: 403 })
    }
    if (contactId && !conversationId) {
      return NextResponse.json({ error: 'conversationId es requerido con contactId', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    let conversationRecord: { id: string; contactId: string | null } | null = null
    if (conversationId) {
      conversationRecord = await db.conversation.findFirst({
        where: {
          id: conversationId,
          workspaceId: session.workspaceId,
          ...(contactId ? { contactId } : {}),
        },
        select: { id: true, contactId: true },
      })
      if (!conversationRecord) {
        return NextResponse.json({ error: 'Conversación no encontrada', code: 'NOT_FOUND' }, { status: 404 })
      }
    }

    const manager = getWhatsAppManager(session.workspaceId)
    let result: { success: boolean; id?: string; error?: string; source?: string }

    if (clientId) {
      const client = ephemeralManager.get(clientId, { ownerId: session.userId, workspaceId: session.workspaceId })
      if (!client || !client.isConnected()) {
        return NextResponse.json({ error: 'Sesion efimera no conectada', code: 'NOT_CONNECTED' }, { status: 503 })
      }
      const r = await client.send(phone, message)
      result = { ...r, source: `ephemeral:${clientId}` }
    } else {
      result = await ephemeralManager.sendAny(
        phone,
        message,
        (p, t) => manager.sendMessage(p, t),
        { ownerId: session.userId, workspaceId: session.workspaceId },
      )
    }

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 503 })
    }

    if (conversationRecord) {
      try {
        await db.message.create({
          data: { conversationId: conversationRecord.id, content: message, type: 'text', direction: 'outbound', senderType: 'agent', externalId: result.id || undefined, metadata: JSON.stringify({ source: result.source }) },
        })
        await db.conversation.update({ where: { id: conversationRecord.id }, data: { lastMessageAt: new Date(), lastMessagePreview: message.slice(0, 100) } })
        if (conversationRecord.contactId) await db.contact.update({ where: { id: conversationRecord.contactId }, data: { lastMessageAt: new Date() } })
      } catch (e) { console.error('[Ephemeral Send] DB error (msg still sent):', e) }
    }

    return NextResponse.json({ success: true, messageId: result.id, phone, source: result.source })
  } catch (error) {
    return errorResponse(error, 'Error al enviar mensaje')
  }
}
