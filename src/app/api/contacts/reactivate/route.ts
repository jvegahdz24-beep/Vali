// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Lead Reactivation API
// POST /api/contacts/reactivate
// Generates personalized reactivation messages and sends via WhatsApp
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { chatWithAI } from '@/lib/ai/providers'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const body = await req.json()
    const { contactId, conversationId, customMessage } = body

    if (!contactId) {
      return Response.json({ error: 'contactId required' }, { status: 400 })
    }

    // Find contact with conversation history
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      include: {
        conversations: {
          where: { status: 'active', channel: 'whatsapp' },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
          include: { messages: { orderBy: { createdAt: 'desc' }, take: 10 } },
        },
      },
    })

    if (!contact || !contact.phone) {
      return Response.json({ error: 'Contact not found or no phone' }, { status: 404 })
    }

    const conversation = contact.conversations[0]
    const messageHistory = conversation?.messages || []
    const daysSinceLastMessage = contact.lastMessageAt
      ? Math.floor((Date.now() - contact.lastMessageAt.getTime()) / (1000 * 60 * 60 * 24))
      : 30

    // Generate reactivation message using AI
    let reactivationMessage: string

    if (customMessage) {
      reactivationMessage = customMessage
    } else {
      const historyText = messageHistory
        .map(m => `${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.content}`)
        .join('\n')

      const aiResult = await chatWithAI(
        [
          {
            role: 'system',
            content: `Eres un asesor de ventas automotrices mexicano. Genera UN SOLO MENSAJE de reactivación para WhatsApp.
Contacto: ${contact.firstName} ${contact.lastName || ''}
Días sin contacto: ${daysSinceLastMessage}
Score del lead: ${contact.leadScore}/100
Últimas interacciones: ${historyText.slice(-500)}

REGLAS:
- Mensaje corto, natural, como WhatsApp (máximo 3 líneas)
- NO suenes desesperado ni presionante
- Incluye un dato nuevo o razón para responder
- Usa el nombre del contacto
- NO uses etiquetas ni formatos
- Español mexicano natural
- Si lleva más de 7 días, ofrece algo nuevo (promoción, nuevo modelo, etc.)
- Si lleva más de 15 días, más casual y empático
- Si lleva más de 30 días, novedad concreta`,
          },
          {
            role: 'user',
            content: `Genera el mensaje de reactivación para ${contact.firstName}.`,
          },
        ],
        'groq',
        undefined,
        { temperature: 0.8, maxTokens: 200 }
      )

      reactivationMessage = aiResult.content.trim().replace(/[""]/g, '')
    }

    // Save outbound message to DB
    if (conversation) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          content: reactivationMessage,
          type: 'text',
          direction: 'outbound',
          senderType: 'agent',
          isAiGenerated: true,
          metadata: JSON.stringify({ type: 'reactivation', daysSinceLastMessage }),
        },
      })

      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: reactivationMessage.slice(0, 100),
        },
      })
    }

    await db.contact.update({
      where: { id: contactId },
      data: { lastMessageAt: new Date() },
    })

    // Try to send via WhatsApp if connected
    let sent = false
    if (whatsAppManager.isConnected()) {
      const sendResult = await whatsAppManager.sendMessage(contact.phone, reactivationMessage)
      sent = sendResult.success
    }

    // Track analytics
    await db.analyticsEvent.create({
      data: {
        workspaceId: conversation?.workspaceId || '',
        eventType: 'lead_reactivation',
        eventData: JSON.stringify({
          contactId,
          daysSinceLastMessage,
          leadScore: contact.leadScore,
          whatsappSent: sent,
        }),
      },
    })

    return Response.json({
      success: true,
      message: reactivationMessage,
      contactId,
      sent,
      daysSinceLastMessage,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
