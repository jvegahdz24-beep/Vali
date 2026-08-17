// ═══════════════════════════════════════════════════════════════
// GET /api/marketing/automation/metrics?workspaceId=&days=30
// Métricas del dashboard de Automatizaciones de Leads (contrato §Pantalla 4):
// leads contactados, mensajes enviados, tasa de respuesta, leads reactivados.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30', 10)))
    await requireWorkspace(workspaceId, session.userId)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Mensajes automáticos enviados (seguimiento / reactivación / flujos por etapa / difusión).
    const outbound = await db.message.findMany({
      where: {
        conversation: { workspaceId },
        direction: 'outbound',
        createdAt: { gte: since },
        OR: [
          { metadata: { contains: '"automated":true' } },
          { senderId: { in: ['followup-worker', 'dib-reactivation', 'stage-flow'] } },
        ],
      },
      select: { conversationId: true },
    })
    const mensajesEnviados = outbound.length
    const contactedConvos = new Set(outbound.map((m) => m.conversationId))
    const leadsContactados = contactedConvos.size

    // Respuestas: de los contactados, cuántos escribieron de vuelta en la ventana.
    let respondieron = 0
    if (contactedConvos.size) {
      const inbound = await db.message.findMany({
        where: { conversationId: { in: [...contactedConvos] }, direction: 'inbound', createdAt: { gte: since } },
        select: { conversationId: true },
      })
      respondieron = new Set(inbound.map((m) => m.conversationId)).size
    }
    const tasaRespuesta = leadsContactados ? Math.round((respondieron / leadsContactados) * 100) : 0

    // Leads reactivados (con al menos una reactivación registrada en la ventana).
    const leadsReactivados = await db.leadProfile.count({
      where: { workspaceId, reactivateCount: { gt: 0 }, lastReactivateAt: { gte: since } },
    }).catch(() => 0)

    return Response.json({ days, mensajesEnviados, leadsContactados, respondieron, tasaRespuesta, leadsReactivados })
  } catch (error) { return errorResponse(error) }
}
