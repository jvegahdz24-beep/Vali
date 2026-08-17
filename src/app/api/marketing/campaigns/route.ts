import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

// GET /api/marketing/campaigns?workspaceId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const campaigns = await db.marketingCampaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { contents: true, calendarEntries: true } },
      },
    })

    return Response.json({ campaigns })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/marketing/campaigns
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, name, objective, channels, audience, budget, currency, startDate, endDate, notes } = body

    if (!workspaceId || !name) {
      return Response.json({ error: 'workspaceId y name son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const campaign = await db.marketingCampaign.create({
      data: {
        workspaceId,
        name,
        objective: objective || 'leads',
        channels: JSON.stringify(channels || []),
        audience: JSON.stringify(audience || {}),
        budget: budget ? parseFloat(budget) : null,
        currency: currency || 'MXN',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || null,
      },
    })

    return Response.json({ campaign }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

// PATCH /api/marketing/campaigns
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, workspaceId, ...updates } = body

    if (!id || !workspaceId) {
      return Response.json({ error: 'id y workspaceId son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.marketingCampaign.findFirst({ where: { id, workspaceId } })
    if (!existing) {
      return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    const data: Parameters<typeof db.marketingCampaign.update>[0]['data'] = {}
    if (updates.name !== undefined) data.name = updates.name
    if (updates.objective !== undefined) data.objective = updates.objective
    if (updates.status !== undefined) data.status = updates.status
    if (updates.channels !== undefined) data.channels = JSON.stringify(updates.channels)
    if (updates.audience !== undefined) data.audience = JSON.stringify(updates.audience)
    if (updates.budget !== undefined) data.budget = updates.budget ? parseFloat(updates.budget) : null
    if (updates.currency !== undefined) data.currency = updates.currency
    if (updates.startDate !== undefined) data.startDate = updates.startDate ? new Date(updates.startDate) : null
    if (updates.endDate !== undefined) data.endDate = updates.endDate ? new Date(updates.endDate) : null
    if (updates.notes !== undefined) data.notes = updates.notes
    if (updates.metrics !== undefined) data.metrics = JSON.stringify(updates.metrics)

    const campaign = await db.marketingCampaign.update({ where: { id }, data })

    return Response.json({ campaign })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/marketing/campaigns?id=xxx&workspaceId=xxx
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') || ''
    const workspaceId = searchParams.get('workspaceId') || ''

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.marketingCampaign.findFirst({ where: { id, workspaceId } })
    if (!existing) {
      return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    await db.marketingCampaign.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
