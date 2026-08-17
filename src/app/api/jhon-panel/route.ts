// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — JHON Panel API
// GET /api/jhon-panel — Global priority + lead narratives
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { interpretLeadMemory } from '@/lib/engine/memory'
import type { LeadMemory, GlobalPriority } from '@/lib/engine/types'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId requerido' },
        { status: 400 }
      )
    }

    // Get all active contacts with score > 0 or recent activity
    const contacts = await db.contact.findMany({
      where: {
        workspaceId,
        status: 'active',
        OR: [
          { leadScore: { gt: 0 } },
          {
            lastMessageAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      include: { leadProfile: true },
      orderBy: { leadScore: 'desc' },
      take: 20,
    })

    // Interpret memory for each contact
    const leads: (LeadMemory & {
      contactName: string
      contactPhone: string | null
      contactScore: number
      contactAvatar: string | null
      contactChannel: string
    })[] = []

    for (const contact of contacts) {
      try {
        const memory = await interpretLeadMemory(contact.id, workspaceId)
        leads.push({
          ...memory,
          contactName: `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`,
          contactPhone: contact.phone,
          contactScore: contact.leadScore,
          contactAvatar: contact.avatar || null,
          contactChannel: contact.source || 'whatsapp',
        })
      } catch {
        // Skip failed interpretations silently
      }
    }

    // Sort by urgency then score
    const urgencyOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    }
    leads.sort((a, b) => {
      const ua = urgencyOrder[a.nextBestAction.urgency] ?? 3
      const ub = urgencyOrder[b.nextBestAction.urgency] ?? 3
      if (ua !== ub) return ua - ub
      return b.contactScore - a.contactScore
    })

    // Global Priority: THE #1 action
    let globalPriority: GlobalPriority | null = null
    if (
      leads.length > 0 &&
      (leads[0].nextBestAction.urgency === 'CRITICAL' ||
        leads[0].nextBestAction.urgency === 'HIGH')
    ) {
      const top = leads[0]
      globalPriority = {
        contactId: top.contactId,
        contactName: top.contactName,
        contactPhone: top.contactPhone,
        action: top.nextBestAction.type,
        actionLabel: top.nextBestAction.label,
        reason: top.nextBestAction.reason,
        urgency: top.nextBestAction.urgency,
        timeToDecay: top.timeToDecay,
        jhonSays: top.nextBestAction.jhonSays,
        confidenceScore: top.confidenceScore,
        score: top.contactScore,
        temperature:
          top.pattern === 'hot_active_buyer' ||
          top.pattern === 'neglected_hot_lead'
            ? 'hot'
            : top.pattern === 'warm_need_nudge' ||
              top.pattern === 'recurring_window_shopper'
            ? 'warm'
            : 'cold',
      }
    }

    // Jhon Insight: global workspace summary
    const hotCount = leads.filter((l) =>
      [
        'neglected_hot_lead',
        'ready_to_close',
        'hot_active_buyer',
      ].includes(l.pattern)
    ).length

    const ghostCount = leads.filter((l) =>
      ['ghost_after_intent', 'cold_no_activity'].includes(l.pattern)
    ).length

    const autoActions = await db.engineEvent.count({
      where: {
        workspaceId,
        type: 'AUTO_ACTION_TRIGGERED',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })

    const jhonInsight = buildJhonInsight(
      leads.length,
      hotCount,
      ghostCount,
      autoActions
    )

    return NextResponse.json({
      jhonInsight,
      globalPriority,
      prioritizedLeads: leads.slice(0, 5),
      totalActiveLeads: leads.length,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

function buildJhonInsight(
  totalLeads: number,
  hotCount: number,
  ghostCount: number,
  autoActions: number
): string {
  if (totalLeads === 0) {
    return 'Sin leads activos. Importa contactos para que Jhon empiece a trabajar.'
  }

  const parts: string[] = []

  if (hotCount > 0) {
    parts.push(
      `${hotCount} lead${hotCount > 1 ? 's' : ''} caliente${hotCount > 1 ? 's' : ''} necesitan atención`
    )
  }
  if (ghostCount > 0) {
    parts.push(
      `${ghostCount} lead${ghostCount > 1 ? 's' : ''} desaparecido${ghostCount > 1 ? 's' : ''} después de mostrar interés`
    )
  }
  if (autoActions > 0) {
    parts.push(
      `${autoActions} acción${autoActions > 1 ? 'es' : ''} automática${autoActions > 1 ? 's' : ''} disparada${autoActions > 1 ? 's' : ''} por inacción`
    )
  }

  if (parts.length === 0) {
    return `${totalLeads} leads en radar. Todo estable por ahora.`
  }

  return parts.join('. ') + '.'
}
