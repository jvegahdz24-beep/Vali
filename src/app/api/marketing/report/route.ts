// Reporte ejecutivo de marketing (F8, 2026-07-22).
// GET  ?workspaceId=&days= → resumen (atribución + métricas Meta + temporada + campañas)
// POST { workspaceId, telegram?:true } → genera y (opcional) lo envía por Telegram
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { buildAttributionReport } from '@/lib/marketing/attribution'
import { seasonalSuggestions } from '@/lib/marketing/seasonal'
import { readMetaCreds, fbPostMetrics, igMediaMetrics } from '@/lib/marketing/meta'
import { broadcastToWorkspace } from '@/lib/telegram'

async function buildReport(workspaceId: string, days: number) {
  const [attr, seasonal, ws, campaigns, posts] = await Promise.all([
    buildAttributionReport(workspaceId, days),
    seasonalSuggestions(workspaceId),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, settings: true } }),
    db.marketingCampaign.count({ where: { workspaceId, status: 'active' } }),
    db.marketingPost.findMany({ where: { workspaceId, status: 'ok', postId: { not: null }, createdAt: { gte: new Date(Date.now() - days * 86400000) } }, orderBy: { createdAt: 'desc' }, take: 20, select: { network: true, postId: true } }),
  ])
  const creds = readMetaCreds(ws?.settings)
  let reach = 0, likes = 0, comments = 0
  if (creds.fbToken || creds.igToken) {
    const ms = await Promise.all(posts.map((p) => p.network === 'instagram' ? igMediaMetrics(creds, p.postId!) : fbPostMetrics(creds, p.postId!)))
    for (const m of ms) if (m) { reach += m.reach; likes += m.likes; comments += m.comments }
  }
  return { name: ws?.name || 'tu negocio', days, attr, seasonal, campaigns, meta: { posts: posts.length, reach, likes, comments } }
}

function toText(r: Awaited<ReturnType<typeof buildReport>>): string {
  const L: string[] = []
  L.push(`📊 REPORTE DE MARKETING — ${r.name} (últimos ${r.days} días)`)
  L.push('')
  L.push(`Publicaciones: ${r.meta.posts} · Alcance: ${r.meta.reach.toLocaleString('es-MX')} · Me gusta: ${r.meta.likes} · Comentarios: ${r.meta.comments}`)
  L.push(`Campañas activas: ${r.campaigns}`)
  L.push('')
  L.push(`Leads desde anuncios: ${r.attr.totalLeadsFromAds} · Ventas atribuidas: ${r.attr.totalWon} · Ingresos: $${r.attr.totalRevenue.toLocaleString('es-MX')}`)
  if (r.attr.bySource.length) {
    L.push('Mejores anuncios:')
    for (const s of r.attr.bySource.slice(0, 3)) L.push(`  • ${s.source.slice(0, 50)} — ${s.leads} leads, ${s.won} ventas (${s.conversionRate}%)`)
  }
  if (r.seasonal.suggestions.length) {
    L.push('')
    L.push('Próximas oportunidades:')
    for (const s of r.seasonal.suggestions.slice(0, 3)) L.push(`  • ${s.season} (en ${s.daysUntil} días): ${s.angle}`)
  }
  L.push('')
  L.push(`Mejor horario para publicar: ${r.seasonal.bestHour}:00 hrs`)
  return L.join('\n')
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 30))
    const r = await buildReport(workspaceId, days)
    return Response.json({ ...r, text: toText(r) })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, days = 30, telegram } = await req.json() as { workspaceId: string; days?: number; telegram?: boolean }
    await requireWorkspace(workspaceId, session.userId)
    const r = await buildReport(workspaceId, Math.min(365, Math.max(7, days)))
    const text = toText(r)
    let sent = false
    if (telegram) { try { await broadcastToWorkspace(workspaceId, text.replace(/\n/g, '\n')); sent = true } catch { /* */ } }
    return Response.json({ text, sentToTelegram: sent })
  } catch (error) { return errorResponse(error) }
}
