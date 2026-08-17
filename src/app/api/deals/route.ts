// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Deals API
// GET /api/deals — List deals
// POST /api/deals — Create deal
// PUT /api/deals — Update deal (id in body)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { canViewAllData } from '@/lib/rbac'
import { recordDealOutcome } from '@/lib/engine/outcomes'
import { markInventorySoldForWonDeal, reserveInventoryForDeal, releaseInventoryForDeal, markContactAsCustomer } from '@/lib/crm/inventory-sync'
import { eventBus, EVENT_TYPES } from '@/lib/event-bus'
import { persistDealStageChangedEvent } from '@/lib/engine/durable-events'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const member = await requireWorkspace(workspaceId!, session.userId)

    const pipelineId = searchParams.get('pipelineId')
    const stageId = searchParams.get('stageId')
    const contactId = searchParams.get('contactId')
    const status = searchParams.get('status') || undefined

    const where: Record<string, unknown> = {
      workspaceId,
      ...(pipelineId ? { pipelineId } : {}),
      ...(stageId ? { stageId } : {}),
      ...(contactId ? { contactId } : {}),
      ...(status ? { status } : {}),
      // RBAC: el vendedor solo ve los tratos asignados a él.
      ...(canViewAllData(member.role) ? {} : { assignedTo: session.userId }),
    }

    const deals = await db.deal.findMany({
      where,
      include: {
        stage: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatar: true,
          },
        },
        pipeline: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ items: deals })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, pipelineId, stageId, contactId, title, value, currency, description, source, expectedCloseDate } = body

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    if (!pipelineId || !stageId || !title) {
      return Response.json(
        { error: 'Missing required fields: pipelineId, stageId, title' },
        { status: 400 }
      )
    }

    // Get current max order for stage
    const maxOrder = await db.deal.findFirst({
      where: { stageId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const deal = await db.deal.create({
      data: {
        workspaceId,
        pipelineId,
        stageId,
        contactId: contactId || null,
        title,
        value: value || 0,
        currency: currency || 'MXN',
        description: description || null,
        source: source || 'manual',
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
        order: (maxOrder?.order || 0) + 1,
      },
      include: {
        stage: true,
        contact: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    })

    // Track event
    await db.analyticsEvent.create({
      data: {
        workspaceId,
        eventType: 'deal_created',
        eventData: JSON.stringify({ dealId: deal.id, title, value: deal.value, stage: deal.stage.name }),
      },
    })

    return Response.json({ success: true, deal }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, stageId, title, value, currency, description, status, contactId, assignedTo, lostReason, expectedCloseDate, order } = body

    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.deal.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Deal not found' }, { status: 404 })
    }
    const member = await requireWorkspace(existing.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

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

    // Normaliza el STATUS al arrastrar a una etapa ganadora/perdedora: antes un
    // drag a "Cerrado Ganado" dejaba status 'active' → el tablero mostraba
    // "Ganados $0" aunque el embudo tuviera cierres (inconsistencia reportada).
    let effectiveStatus = status as string | undefined
    if (stageId && status === undefined && existing.status !== 'won' && existing.status !== 'lost') {
      if (deal.stage?.isWon) {
        await db.deal.update({ where: { id }, data: { status: 'won', wonAt: new Date() } })
        deal.status = 'won'
        effectiveStatus = 'won'
        console.log(`[Deals] ${id} arrastrado a etapa ganadora → status=won automático`)
      } else if (deal.stage?.isLost) {
        await db.deal.update({ where: { id }, data: { status: 'lost', lostAt: new Date() } })
        deal.status = 'lost'
        effectiveStatus = 'lost'
        console.log(`[Deals] ${id} arrastrado a etapa perdedora → status=lost automático`)
      }
    }

    // Ciclo de aprendizaje gBrain: registra el resultado del cierre (lo lee engine/memory.ts)
    if (effectiveStatus === 'won' || effectiveStatus === 'lost') {
      await recordDealOutcome({
        workspaceId: existing.workspaceId,
        contactId: deal.contact?.id ?? existing.contactId,
        won: effectiveStatus === 'won',
        dealId: deal.id,
        value: deal.value,
        reason: effectiveStatus === 'lost' ? (lostReason ?? existing.lostReason ?? null) : null,
      })
    }

    // ── Conexiones Pipeline → Inventario/Contacto (no críticas, nunca rompen el PUT) ──
    // GANADO: unidad → vendida + contacto → etiqueta 'cliente'.
    // Entra a NEGOCIACIÓN: unidad → apartada. Sale de Negociación sin ganar o
    // se PIERDE: unidad apartada por este trato → liberada.
    const becameWon = effectiveStatus === 'won' && existing.status !== 'won'
    const becameLost = effectiveStatus === 'lost' && existing.status !== 'lost'
    const dealContactId = deal.contact?.id ?? existing.contactId
    const normStage = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    let oldStageName = ''
    if (stageId && existing.stageId && existing.stageId !== stageId) {
      const oldStage = await db.pipelineStage.findUnique({ where: { id: existing.stageId }, select: { name: true } }).catch(() => null)
      oldStageName = normStage(oldStage?.name)
    }
    const newStageName = normStage(deal.stage?.name)
    const enteredNego = !!stageId && newStageName === 'negociacion' && oldStageName !== 'negociacion' && existing.stageId !== stageId
    const leftNegoWithoutWin = !!stageId && oldStageName === 'negociacion' && newStageName !== 'negociacion' && !becameWon

    if (becameWon) {
      await markInventorySoldForWonDeal({
        workspaceId: existing.workspaceId, dealId: deal.id, dealTitle: deal.title, contactId: dealContactId,
      }).catch(() => {})
      if (dealContactId) {
        await markContactAsCustomer({
          workspaceId: existing.workspaceId, contactId: dealContactId, dealId: deal.id, dealTitle: deal.title,
        }).catch(() => {})
        // POSTVENTA (2026-07-20): al ganar arranca la secuencia post-sale
        // (7d check-in / 30d referidos+reseña / 180d servicio / 365d aniversario).
        try {
          const { schedulePostSale } = await import('@/lib/crm/postsale')
          await schedulePostSale({ workspaceId: existing.workspaceId, contactId: dealContactId, dealTitle: deal.title })
        } catch { /* nunca rompe el PUT */ }
        // ATRIBUCIÓN (F2): la venta se acredita al agente IA que llevó la conversación.
        try {
          const { attributeSaleToAgent } = await import('@/lib/agent-factory/attribution')
          await attributeSaleToAgent(existing.workspaceId, dealContactId)
        } catch { /* no crítico */ }
      }
    } else if (enteredNego) {
      await reserveInventoryForDeal({
        workspaceId: existing.workspaceId, dealId: deal.id, dealTitle: deal.title, contactId: dealContactId,
      }).catch(() => {})
    }
    if (becameLost || leftNegoWithoutWin) {
      await releaseInventoryForDeal({
        workspaceId: existing.workspaceId, dealId: deal.id, contactId: dealContactId,
        reason: becameLost ? 'trato perdido' : 'el trato salió de Negociación',
      }).catch(() => {})
    }

    const stageChanged = Boolean(stageId && existing.stageId !== stageId)
    if (stageChanged) {
      const durableEventId = await persistDealStageChangedEvent({
        dealId: deal.id,
        workspaceId: existing.workspaceId,
        contactId: dealContactId,
        fromStageId: existing.stageId,
        fromStageName: oldStageName || null,
        toStageId: deal.stageId,
        toStageName: deal.stage?.name,
        status: deal.status,
        value: String(deal.value),
      })

      // La persistencia durable ocurre primero; el bus en memoria mantiene la
      // reacción inmediata del proceso sin ser la única fuente del evento.
      void eventBus.emit(EVENT_TYPES.DEAL_STAGE_CHANGED, {
        dealId: deal.id,
        workspaceId: existing.workspaceId,
        contactId: dealContactId,
        fromStageId: existing.stageId,
        fromStageName: oldStageName || null,
        toStageId: deal.stageId,
        toStageName: deal.stage?.name,
        value: String(deal.value),
      }, 'deals-api', { durableEventId })
    }

    // Track event
    if (effectiveStatus === 'won' || effectiveStatus === 'lost' || stageId) {
      await db.analyticsEvent.create({
        data: {
          workspaceId: existing.workspaceId,
          eventType: effectiveStatus === 'won' ? 'deal_won' : effectiveStatus === 'lost' ? 'deal_lost' : 'deal_updated',
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

    return Response.json({ success: true, deal })
  } catch (error) {
    return errorResponse(error)
  }
}
