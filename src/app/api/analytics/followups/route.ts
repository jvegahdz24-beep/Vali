// ═══════════════════════════════════════════════════════════════
// ANALÍTICA DEL MOTOR DE SEGUIMIENTO — ¿qué gatillo psicológico revive
// más leads? GET /api/analytics/followups?workspaceId=&days=30
// Por cada seguimiento ENVIADO: ¿el cliente respondió (inbound en esa
// conversación dentro de los 7 días siguientes)? Agrupado por gatillo.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

const LABELS: Record<string, string> = {
  reciprocidad: 'Reciprocidad (24h)',
  curiosidad: 'Curiosidad',
  autoridad: 'Autoridad',
  dolor: 'Dolor',
  prueba_social: 'Prueba social',
  fomo: 'FOMO',
  micro_compromiso: 'Micro-compromiso',
  empatia: 'Empatía',
  costo_oportunidad: 'Costo de oportunidad',
  reactivacion_fria: 'Rescate frío (24h)',
  recordatorio_suave: 'Recordatorio suave',
  valor: 'Mensaje de valor',
  nueva_oferta: 'Nueva oferta',
  urgencia_suave: 'Urgencia suave',
  recordatorio_necesidad: 'Recordatorio de necesidad',
  reactivacion_emocional: 'Reactivación emocional',
  reactivacion_final: 'Reactivación final',
}

const REPLY_WINDOW_MS = 7 * 24 * 3600000

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const days = Math.min(180, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 30))
    const since = new Date(Date.now() - days * 86400000)

    const sent = await db.followUpTask.findMany({
      where: { workspaceId, status: 'sent', sentAt: { gte: since } },
      select: { id: true, conversationId: true, contactId: true, sentAt: true, metadata: true, ruleId: true },
    })
    if (sent.length === 0) {
      return NextResponse.json({ success: true, days, total: { enviados: 0, respondieron: 0, tasa: 0 }, porGatillo: [], leadsRevividos: 0 })
    }

    // Inbounds de esas conversaciones desde el primer envío (una sola query)
    const convIds = [...new Set(sent.map((t) => t.conversationId))]
    const minSent = new Date(Math.min(...sent.map((t) => t.sentAt!.getTime())))
    const inbounds = await db.message.findMany({
      where: { conversationId: { in: convIds }, direction: 'inbound', createdAt: { gte: minSent } },
      select: { conversationId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const byConv = new Map<string, number[]>()
    for (const m of inbounds) {
      const arr = byConv.get(m.conversationId) || []
      arr.push(m.createdAt.getTime())
      byConv.set(m.conversationId, arr)
    }

    const agg = new Map<string, { enviados: number; respondieron: number }>()
    const revived = new Set<string>()
    let totalEnv = 0, totalResp = 0
    for (const t of sent) {
      let tipo = 'otro'
      try { tipo = (JSON.parse(t.metadata || '{}').tipo as string) || (t.ruleId === 'dib-reactivation' ? 'reactivacion_emocional' : 'otro') } catch { /* */ }
      if (t.ruleId === 'manual-broadcast') tipo = 'difusion_manual'
      const stat = agg.get(tipo) || { enviados: 0, respondieron: 0 }
      stat.enviados++; totalEnv++
      const sentAt = t.sentAt!.getTime()
      const replied = (byConv.get(t.conversationId) || []).some((ts) => ts > sentAt && ts <= sentAt + REPLY_WINDOW_MS)
      if (replied) { stat.respondieron++; totalResp++; if (t.contactId) revived.add(t.contactId) }
      agg.set(tipo, stat)
    }

    const porGatillo = [...agg.entries()]
      .map(([tipo, s]) => ({
        tipo,
        label: LABELS[tipo] || (tipo === 'difusion_manual' ? 'Difusión manual' : tipo),
        enviados: s.enviados,
        respondieron: s.respondieron,
        tasa: s.enviados ? Math.round((s.respondieron / s.enviados) * 100) : 0,
      }))
      .sort((a, b) => b.tasa - a.tasa || b.enviados - a.enviados)

    return NextResponse.json({
      success: true, days,
      total: { enviados: totalEnv, respondieron: totalResp, tasa: totalEnv ? Math.round((totalResp / totalEnv) * 100) : 0 },
      porGatillo,
      leadsRevividos: revived.size,
    })
  } catch (error) { return errorResponse(error) }
}
