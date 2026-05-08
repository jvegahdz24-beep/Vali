import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import {
  runLifeEngineCycle,
  getPendingFollowUps,
  getEnergyHistory,
  getSilenceAlerts,
  getBehavioralPatterns,
  updateFollowUpStatus,
  resolveSilenceAlert,
} from '@/lib/nexus-life-engine'

// POST /api/nexus/life-engine — Trigger a life engine cycle
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    // Run the engine cycle asynchronously
    const result = await runLifeEngineCycle()

    return Response.json({
      success: true,
      message: 'Ciclo del Life Engine completado',
      ...result,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// GET /api/nexus/life-engine — Get life engine status and data
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'overview'

    switch (view) {
      case 'followups': {
        const followUps = await getPendingFollowUps(session.userId)
        return Response.json({ followUps })
      }

      case 'energy': {
        const limit = parseInt(searchParams.get('limit') || '30')
        const energyHistory = await getEnergyHistory(session.userId, limit)
        return Response.json({ energyHistory })
      }

      case 'silences': {
        const status = searchParams.get('status') || 'all'
        const alerts = await getSilenceAlerts(session.userId, status)
        return Response.json({ alerts })
      }

      case 'patterns': {
        const patterns = await getBehavioralPatterns(session.userId)
        return Response.json({ patterns })
      }

      case 'overview':
      default: {
        const [followUps, energyHistory, silences, patterns] = await Promise.all([
          getPendingFollowUps(session.userId),
          getEnergyHistory(session.userId, 7),
          getSilenceAlerts(session.userId, 'active'),
          getBehavioralPatterns(session.userId),
        ])

        return Response.json({
          overview: {
            pendingFollowUps: followUps.length,
            latestEnergy: energyHistory[0] || null,
            activeSilences: silences.length,
            patternsCount: patterns.length,
          },
          followUps: followUps.slice(0, 5),
          energyHistory: energyHistory.slice(0, 7),
          silences,
          patterns: patterns.slice(0, 10),
        })
      }
    }
  } catch (error) {
    return errorResponse(error)
  }
}

// PATCH /api/nexus/life-engine — Update follow-up or silence alert status
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()
    const { action, id, status } = body

    if (!action || !id || !status) {
      return Response.json({ error: 'action, id y status son requeridos' }, { status: 400 })
    }

    switch (action) {
      case 'followup': {
        const followUp = await updateFollowUpStatus(id, session.userId, status)
        return Response.json({ success: true, followUp })
      }

      case 'silence': {
        const alert = await resolveSilenceAlert(id, session.userId, status)
        return Response.json({ success: true, alert })
      }

      default:
        return Response.json({ error: 'Acción no válida. Usa "followup" o "silence"' }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
