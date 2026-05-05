// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Advanced Analytics API
// GET /api/analytics/advanced — Advanced behavioral analytics
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import {
  getContactAnalytics,
  getWorkspaceAnalytics,
  getGhostingAlerts,
  getFunnelMetrics,
  getEmotionalTrend,
} from '@/lib/analytics-advanced'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const action = searchParams.get('action') || 'workspace'
    const contactId = searchParams.get('contactId')
    const period = searchParams.get('period') || '30d'
    const days = parseInt(searchParams.get('days') || '30', 10)

    switch (action) {
      case 'contact': {
        // Full analytics for a single contact
        if (!contactId) {
          return Response.json(
            { error: 'contactId es requerido para la acción "contact"' },
            { status: 400 }
          )
        }
        const contactAnalytics = await getContactAnalytics(contactId)
        if (!contactAnalytics) {
          return Response.json({ error: 'Contacto no encontrado' }, { status: 404 })
        }
        return Response.json(contactAnalytics)
      }

      case 'ghosting': {
        // Active ghosting alerts
        const alerts = await getGhostingAlerts(workspaceId!)
        return Response.json({ alerts })
      }

      case 'funnel': {
        // Pipeline funnel metrics
        const funnel = await getFunnelMetrics(workspaceId!)
        return Response.json(funnel)
      }

      case 'emotional': {
        // Emotional trend for a contact
        if (!contactId) {
          return Response.json(
            { error: 'contactId es requerido para la acción "emotional"' },
            { status: 400 }
          )
        }
        const emotional = await getEmotionalTrend(contactId, days)
        return Response.json(emotional)
      }

      case 'workspace':
      default: {
        // Full workspace analytics
        const workspaceAnalytics = await getWorkspaceAnalytics(workspaceId!, period)
        return Response.json(workspaceAnalytics)
      }
    }
  } catch (error) {
    console.error('[Advanced Analytics Error]', error)
    return errorResponse(error)
  }
}
