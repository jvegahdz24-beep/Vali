import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// POST /api/nexus/vacation — Toggle vacation mode
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { enabled, startDate, endDate } = body as {
      enabled: boolean
      startDate?: string
      endDate?: string
    }

    const profile = await db.nexusProfile.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        vacationMode: enabled,
        vacationStartAt: startDate ? new Date(startDate) : null,
        vacationEndAt: endDate ? new Date(endDate) : null,
      },
      update: {
        vacationMode: enabled,
        vacationStartAt: startDate ? new Date(startDate) : null,
        vacationEndAt: endDate ? new Date(endDate) : null,
      },
    })

    // When enabled, create a task
    if (enabled) {
      await db.nexusTask.create({
        data: {
          userId: session.userId,
          title: 'Modo vacaciones activado',
          description: startDate && endDate
            ? `Vacaciones del ${new Date(startDate).toLocaleDateString('es-MX')} al ${new Date(endDate).toLocaleDateString('es-MX')}`
            : 'Modo vacaciones activado sin fecha específica',
          status: 'completed',
          priority: 'low',
          source: 'system',
        },
      })
    }

    return Response.json({ profile })
  } catch (error) {
    return errorResponse(error)
  }
}
