// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Calendar / Appointments API
// GET    /api/calendar — List appointments
// POST   /api/calendar — Create appointment
// PUT    /api/calendar — Update appointment (id in body)
// DELETE /api/calendar — Delete appointment (id in body/searchParams)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const contactId = searchParams.get('contactId')

    const where: Record<string, unknown> = { workspaceId: workspaceId! }

    if (startDate || endDate) {
      where.date = {}
      if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
      if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate)
    }
    if (type) where.type = type
    if (status) where.status = status
    if (contactId) where.contactId = contactId

    const appointments = await db.appointment.findMany({
      where,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
      orderBy: { date: 'asc' },
    })

    // Also get stats
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [totalThisMonth, completedThisMonth, pendingThisMonth, cancelledThisMonth] =
      await Promise.all([
        db.appointment.count({
          where: {
            workspaceId: workspaceId!,
            date: { gte: monthStart, lt: monthEnd },
          },
        }),
        db.appointment.count({
          where: {
            workspaceId: workspaceId!,
            date: { gte: monthStart, lt: monthEnd },
            status: 'completed',
          },
        }),
        db.appointment.count({
          where: {
            workspaceId: workspaceId!,
            date: { gte: monthStart, lt: monthEnd },
            status: 'pending',
          },
        }),
        db.appointment.count({
          where: {
            workspaceId: workspaceId!,
            date: { gte: monthStart, lt: monthEnd },
            status: 'cancelled',
          },
        }),
      ])

    // Upcoming appointments (next 7 days)
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const upcoming = await db.appointment.findMany({
      where: {
        workspaceId: workspaceId!,
        date: { gte: now, lte: nextWeek },
        status: 'pending',
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { date: 'asc' },
      take: 10,
    })

    return Response.json({
      appointments,
      stats: {
        totalThisMonth,
        completedThisMonth,
        pendingThisMonth,
        cancelledThisMonth,
      },
      upcoming,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, contactId, title, description, date, duration, type, status } = body

    await requireWorkspace(workspaceId, session.userId)

    if (!title || !date) {
      return Response.json(
        { error: 'Campos requeridos: title, date' },
        { status: 400 }
      )
    }

    const appointment = await db.appointment.create({
      data: {
        workspaceId,
        contactId: contactId || null,
        title,
        description: description || null,
        date: new Date(date),
        duration: duration || 30,
        type: type || 'call',
        status: status || 'pending',
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    })

    return Response.json({ success: true, appointment }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, ...data } = body

    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }

    // Verify workspace access via appointment
    const existing = await db.appointment.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    await requireWorkspace(existing.workspaceId, session.userId)

    const updateData: Record<string, unknown> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.date !== undefined) updateData.date = new Date(data.date)
    if (data.duration !== undefined) updateData.duration = data.duration
    if (data.type !== undefined) updateData.type = data.type
    if (data.status !== undefined) updateData.status = data.status
    if (data.contactId !== undefined) updateData.contactId = data.contactId || null

    const appointment = await db.appointment.update({
      where: { id },
      data: updateData,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    })

    return Response.json({ success: true, appointment })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return Response.json({ error: 'ID requerido' }, { status: 400 })
    }

    // Verify workspace access
    const existing = await db.appointment.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    await requireWorkspace(existing.workspaceId, session.userId)

    await db.appointment.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
