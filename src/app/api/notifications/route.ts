import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    // Modo normal (campanita): últimos 15 min. Modo full ("Ver todas"): últimas 48 h.
    const full = searchParams.get('full') === '1'
    const fifteenMinutesAgo = new Date(Date.now() - (full ? 48 * 60 * 60 * 1000 : 15 * 60 * 1000))

    // Get recent messages as notifications
    const recentMessages = (await db.message.findMany({
      where: {
        conversation: { workspaceId: workspaceId! },
        createdAt: { gte: fifteenMinutesAgo },
      },
      include: {
        conversation: {
          include: {
            contact: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: full ? 120 : 20,
    })) as Array<any>

    // Get recent deals activity
    const recentDeals = (await db.deal.findMany({
      where: {
        workspaceId: workspaceId!,
        updatedAt: { gte: fifteenMinutesAgo },
        OR: [
          { status: 'won' },
          { status: 'lost' },
        ],
      },
      include: {
        contact: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: full ? 40 : 10,
    })) as Array<any>

    // Get recent contact activity
    const recentContacts = await db.contact.findMany({
      where: {
        workspaceId: workspaceId!,
        createdAt: { gte: fifteenMinutesAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: full ? 40 : 10,
    })

    // Build notifications. contactId + view permiten al cliente navegar a donde
    // corresponde (mensaje → esa conversación en la bandeja, trato → pipeline,
    // contacto nuevo → módulo de contactos).
    const notifications: Array<{
      id: string
      type: 'message' | 'deal_won' | 'deal_lost' | 'new_contact' | 'ai_response' | 'system'
      title: string
      description: string
      timestamp: Date
      read: boolean
      contactId?: string
      view?: string
      actionUrl?: string
    }> = []

    const descLimit = full ? 220 : 80

    for (const msg of recentMessages) {
      const contactName = msg.conversation.contact
        ? `${msg.conversation.contact.firstName}${msg.conversation.contact.lastName ? ' ' + msg.conversation.contact.lastName : ''}`
        : 'Cliente'
      const cId = msg.conversation.contact?.id as string | undefined

      if (msg.direction === 'inbound') {
        notifications.push({
          id: `msg-${msg.id}`,
          type: 'message',
          title: `Nuevo mensaje de ${contactName}`,
          description: msg.content.substring(0, descLimit) + (msg.content.length > descLimit ? '...' : ''),
          timestamp: msg.createdAt,
          read: false,
          contactId: cId,
          view: 'inbox',
        })
      }

      if (msg.isAiGenerated && msg.direction === 'outbound') {
        notifications.push({
          id: `ai-${msg.id}`,
          type: 'ai_response',
          title: `IA respondió a ${contactName}`,
          description: msg.content.substring(0, descLimit) + (msg.content.length > descLimit ? '...' : ''),
          timestamp: msg.createdAt,
          read: false,
          contactId: cId,
          view: 'inbox',
        })
      }
    }

    for (const deal of recentDeals) {
      const contactName = deal.contact
        ? `${deal.contact.firstName}${deal.contact.lastName ? ' ' + deal.contact.lastName : ''}`
        : 'Cliente'

      if (deal.status === 'won') {
        notifications.push({
          id: `deal-won-${deal.id}`,
          type: 'deal_won',
          title: '¡Trato cerrado!',
          description: `${contactName} — ${deal.title} ($${deal.value.toLocaleString('es-MX')} MXN)`,
          timestamp: deal.wonAt || deal.updatedAt,
          read: false,
          contactId: deal.contactId || deal.contact?.id,
          view: 'pipeline',
        })
      } else if (deal.status === 'lost') {
        notifications.push({
          id: `deal-lost-${deal.id}`,
          type: 'deal_lost',
          title: 'Trato perdido',
          description: `${contactName} — ${deal.title}`,
          timestamp: deal.lostAt || deal.updatedAt,
          read: false,
          contactId: deal.contactId || deal.contact?.id,
          view: 'pipeline',
        })
      }
    }

    for (const contact of recentContacts) {
      notifications.push({
        id: `contact-${contact.id}`,
        type: 'new_contact',
        title: 'Nuevo contacto',
        description: `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''} — ${contact.source}`,
        timestamp: contact.createdAt,
        read: false,
        contactId: contact.id,
        view: 'contacts',
      })
    }

    // Sort by timestamp desc
    notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // Get unread count from analytics events (as a proxy)
    const recentEvents = await db.analyticsEvent.count({
      where: {
        workspaceId: workspaceId!,
        createdAt: { gte: fifteenMinutesAgo },
      },
    })

    return Response.json({
      success: true,
      notifications: notifications.slice(0, full ? 150 : 20),
      unreadCount: notifications.length,
      recentEventCount: recentEvents,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request)
    // Mark all as read (just return success — real implementation would track read state)
    return Response.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' })
  } catch (error) {
    return errorResponse(error)
  }
}
