import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

// GET /api/marketing/calendar?workspaceId=xxx&month=2026-05
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    const month = searchParams.get('month') // e.g. "2026-05"

    await requireWorkspace(workspaceId, session.userId)

    let dateFilter = {}
    if (month) {
      const [year, m] = month.split('-').map(Number)
      const start = new Date(year, m - 1, 1)
      const end = new Date(year, m, 1)
      dateFilter = { scheduledAt: { gte: start, lt: end } }
    }

    const entries = await db.contentCalendarEntry.findMany({
      where: { workspaceId, ...dateFilter },
      orderBy: { scheduledAt: 'asc' },
      include: {
        content: { select: { id: true, type: true, title: true, channel: true } },
        campaign: { select: { id: true, name: true, objective: true } },
      },
    })

    return Response.json({ entries })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/marketing/calendar
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, campaignId, contentId, title, channel, scheduledAt, notes } = body

    if (!workspaceId || !title || !channel || !scheduledAt) {
      return Response.json({ error: 'workspaceId, title, channel y scheduledAt son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const entry = await db.contentCalendarEntry.create({
      data: {
        workspaceId,
        campaignId: campaignId || null,
        contentId: contentId || null,
        title,
        channel,
        scheduledAt: new Date(scheduledAt),
        notes: notes || null,
      },
    })

    return Response.json({ entry }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

// PATCH /api/marketing/calendar
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, workspaceId, ...updates } = body

    if (!id || !workspaceId) {
      return Response.json({ error: 'id y workspaceId son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.contentCalendarEntry.findFirst({ where: { id, workspaceId } })
    if (!existing) return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })

    const data: Parameters<typeof db.contentCalendarEntry.update>[0]['data'] = {}
    if (updates.title !== undefined) data.title = updates.title
    if (updates.channel !== undefined) data.channel = updates.channel
    if (updates.scheduledAt !== undefined) data.scheduledAt = new Date(updates.scheduledAt)
    if (updates.status !== undefined) data.status = updates.status
    if (updates.notes !== undefined) data.notes = updates.notes
    if (updates.contentId !== undefined) data.contentId = updates.contentId || null

    const entry = await db.contentCalendarEntry.update({ where: { id }, data })

    return Response.json({ entry })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/marketing/calendar?id=xxx&workspaceId=xxx
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') || ''
    const workspaceId = searchParams.get('workspaceId') || ''

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.contentCalendarEntry.findFirst({ where: { id, workspaceId } })
    if (!existing) return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })

    await db.contentCalendarEntry.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
