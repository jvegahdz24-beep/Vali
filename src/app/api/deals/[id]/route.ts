// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Deal by ID API
// GET /api/deals/[id] — Get deal
// PUT /api/deals/[id] — Update deal
// DELETE /api/deals/[id] — Delete deal
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { EVENT_TYPES, publish } from '@/lib/event-bus'
import { recordDealOutcome } from '@/lib/engine/outcomes'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const deal = await db.deal.findUnique({
      where: { id },
      include: {
        stage: true,
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true, avatar: true },
        },
        pipeline: {
          select: { id: true, name: true },
        },
      },
    })

    if (!deal) {
      return Response.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    await requireWorkspace(deal.workspaceId, session.userId)

    return Response.json({ deal })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()

    const existing = await db.deal.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Deal no encontrado' }, { status: 404 })
    }
    const member = await requireWorkspace(existing.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const { stageId, title, value, currency, description, status, contactId, assignedTo, lostReason, expectedCloseDate, order } = body

    const updateData: Record<string, unknown> = {}
    if (stageId !== undefined) updateData.stageId = stageId
    if (title !== undefined) updateData.title = title
    if (value !== undefined) updateData.value = value
    if (currency !== undefined) updateData.currency = currency
    if (description !== undefined) updateData.description = description
    if (contactId !== undefined) updateData.contactId = contactId
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo
    if (lostReason !== undefined) updateData.lostReason = lostReason
    if (order !== undefined) updateData.order = order
    if (expectedCloseDate !== undefined) {
      updateData.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null
    }

    // Handle status changes
    if (status !== undefined) {
      updateData.status = status
      if (status === 'won') {
        updateData.wonAt = new Date()
      }
      if (status === 'lost') {
        updateData.lostAt = new Date()
      }
    }

    const deal = await db.deal.update({
      where: { id },
      data: updateData,
      include: {
        stage: true,
        contact: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    })

    // Ciclo de aprendizaje gBrain: registra el resultado del cierre (lo lee engine/memory.ts)
    if (status === 'won' || status === 'lost') {
      await recordDealOutcome({
        workspaceId: existing.workspaceId,
        contactId: deal.contact?.id ?? existing.contactId,
        won: status === 'won',
        dealId: deal.id,
        value: deal.value,
        reason: status === 'lost' ? (lostReason ?? existing.lostReason ?? null) : null,
      })
    }

    // Track event
    if (status === 'won' || status === 'lost' || stageId) {
      await db.analyticsEvent.create({
        data: {
          workspaceId: existing.workspaceId,
          eventType: status === 'won' ? 'deal_won' : status === 'lost' ? 'deal_lost' : 'deal_updated',
          eventData: JSON.stringify({
            dealId: deal.id,
            title: deal.title,
            value: deal.value,
            status: deal.status,
            stage: deal.stage.name,
          }),
        },
      })
    }

    // FIX P0: Publish deal.stage.changed event + persist DealStageHistory
    if (stageId && stageId !== existing.stageId) {
      const oldStage = await db.pipelineStage.findUnique({ where: { id: existing.stageId } })
      const contactName = deal.contact ? `${deal.contact.firstName} ${(deal.contact as any).lastName || ''}`.trim() : undefined

      // Persist history record
      await db.dealStageHistory.create({
        data: {
          dealId: deal.id,
          workspaceId: existing.workspaceId,
          contactId: deal.contact?.id ?? existing.contactId ?? undefined,
          userId: session.userId,
          oldStageId: existing.stageId,
          oldStageName: oldStage?.name ?? null,
          newStageId: deal.stageId,
          newStageName: deal.stage.name,
        },
      })

      publish(EVENT_TYPES.DEAL_STAGE_CHANGED, {
        dealId: deal.id,
        workspaceId: existing.workspaceId,
        contactId: deal.contact?.id ?? existing.contactId,
        contactName,
        oldStageId: existing.stageId,
        oldStageName: oldStage?.name,
        newStageId: deal.stageId,
        newStageName: deal.stage.name,
        value: deal.value,
      })

      // FLUJOS POR ETAPA (contrato §2c): ejecuta las MarketingAutomation
      // configuradas para esta etapa (bienvenida/seguimiento/cierre/postventa),
      // enviando por el canal preferido del lead. Fire-and-forget: nunca rompe
      // el guardado del deal.
      import('@/lib/marketing/stage-flows')
        .then((m) => m.runStageFlows(existing.workspaceId, deal.contact?.id ?? existing.contactId, deal.stage.name, deal.stageId))
        .catch(() => {})
    }

    return Response.json({ success: true, deal })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const deal = await db.deal.findUnique({ where: { id } })

    if (!deal) {
      return Response.json({ error: 'Deal no encontrado' }, { status: 404 })
    }
    const member = await requireWorkspace(deal.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    await db.deal.delete({ where: { id } })

    // Track event
    await db.analyticsEvent.create({
      data: {
        workspaceId: deal.workspaceId,
        eventType: 'deal_deleted',
        eventData: JSON.stringify({
          dealId: deal.id,
          title: deal.title,
          value: deal.value,
        }),
      },
    })

    return Response.json({ success: true, message: 'Deal eliminado' })
  } catch (error) {
    return errorResponse(error)
  }
}
