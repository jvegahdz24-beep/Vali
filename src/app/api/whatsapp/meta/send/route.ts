// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta Send API
// POST /api/whatsapp/meta/send  → Send text/image via Meta API
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { sendMetaTextMessage, sendMetaImageMessage } from '@/lib/whatsapp/meta-api'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  let body: {
    workspaceId: string
    to: string
    text?: string
    imageUrl?: string
    caption?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { workspaceId, to, text, imageUrl, caption } = body
  if (!workspaceId || !to) {
    return NextResponse.json({ error: 'workspaceId and to are required' }, { status: 400 })
  }
  if (!text && !imageUrl) {
    return NextResponse.json({ error: 'text or imageUrl is required' }, { status: 400 })
  }

  const ws = await requireWorkspace(workspaceId, auth.userId)
  if (ws instanceof NextResponse) return ws

  const config = await db.metaApiConfig.findUnique({
    where: { workspaceId },
    select: { phoneNumberId: true, accessToken: true, isActive: true },
  })
  if (!config?.isActive) {
    return NextResponse.json({ error: 'Meta API not configured or inactive' }, { status: 400 })
  }

  const result = imageUrl
    ? await sendMetaImageMessage(config.phoneNumberId, config.accessToken, to, imageUrl, caption)
    : await sendMetaTextMessage(config.phoneNumberId, config.accessToken, to, text!)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  // Save outbound message to DB for conversation history
  const cleanPhone = to.replace(/\D/g, '')
  const contact = await db.contact.findFirst({
    where: { workspaceId, phone: { contains: cleanPhone.slice(-10) } },
    select: { id: true },
  })
  const conversation = contact
    ? await db.conversation.findFirst({
        where: { workspaceId, contactId: contact.id },
        select: { id: true },
      })
    : null

  if (conversation) {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'agent',
        content: text ?? (imageUrl ? `[Imagen] ${caption ?? ''}`.trim() : ''),
        externalId: result.messageId ?? null,
        isAiGenerated: false,
      },
    })
  }

  return NextResponse.json({ success: true, messageId: result.messageId })
}
