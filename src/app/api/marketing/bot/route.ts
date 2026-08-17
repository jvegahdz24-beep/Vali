// ═══════════════════════════════════════════════════════════════
// GET/PUT /api/marketing/bot — configuración del bot de marketing.
// GET además devuelve estado de conexión y próximos horarios óptimos.
// RBAC: settings.manage para PUT.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { readMetaCreds, canPublishFacebook, canPublishInstagram } from '@/lib/marketing/meta'
import { readLearnedStats } from '@/lib/marketing/learning'
import { nextOptimalSlot, bestTimesSummary } from '@/lib/marketing/schedule'

const J = (s: string, d: unknown) => { try { return JSON.parse(s) } catch { return d } }

async function getOrCreate(workspaceId: string) {
  let cfg = await db.marketingBotConfig.findUnique({ where: { workspaceId } })
  if (!cfg) cfg = await db.marketingBotConfig.create({ data: { workspaceId } })
  return cfg
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const [cfg, ws] = await Promise.all([
      getOrCreate(workspaceId),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } }),
    ])
    const creds = readMetaCreds(ws?.settings)
    let approval = false
    let business: Record<string, string> = {}
    try {
      const s = JSON.parse(ws?.settings || '{}')
      approval = s.marketingApproval === 'telegram'
      business = s.marketing?.business || {}
    } catch { /* off */ }
    return Response.json({
      approval,
      business: {
        dealerName: business.dealerName || '',
        ubicacion: business.ubicacion || '',
        phone: business.phone || '',
        site: business.site || '',
      },
      config: { ...cfg, networks: J(cfg.networks, []), formats: J(cfg.formats, []) },
      connection: { facebook: canPublishFacebook(creds), instagram: canPublishInstagram(creds) },
      bestTimes: bestTimesSummary(),
      nextSlots: { instagram: nextOptimalSlot('instagram'), facebook: nextOptimalSlot('facebook') },
      learning: readLearnedStats(ws?.settings),
    })
  } catch (error) { return errorResponse(error) }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; enabled?: boolean; networks?: string[]; formats?: string[]; maxPerDay?: number; templateStrategy?: string; autoVideo?: boolean; approval?: boolean; business?: { dealerName?: string; ubicacion?: string; phone?: string; site?: string } }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'settings.manage')
    await getOrCreate(body.workspaceId)
    // Modo "aprobar por Telegram antes de publicar" + datos del negocio
    // (ambos viven en settings del workspace, no en MarketingBotConfig)
    if (typeof body.approval === 'boolean' || body.business) {
      const ws = await db.workspace.findUnique({ where: { id: body.workspaceId }, select: { settings: true } })
      let s: Record<string, unknown> = {}
      try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
      if (typeof body.approval === 'boolean') {
        if (body.approval) s.marketingApproval = 'telegram'
        else delete s.marketingApproval
      }
      if (body.business) {
        const mk = (s.marketing as Record<string, unknown>) || {}
        mk.business = {
          dealerName: (body.business.dealerName || '').trim(),
          ubicacion: (body.business.ubicacion || '').trim(),
          phone: (body.business.phone || '').trim(),
          site: (body.business.site || '').trim(),
        }
        s.marketing = mk
      }
      await db.workspace.update({ where: { id: body.workspaceId }, data: { settings: JSON.stringify(s) } })
    }
    const cfg = await db.marketingBotConfig.update({
      where: { workspaceId: body.workspaceId },
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.networks ? { networks: JSON.stringify(body.networks) } : {}),
        ...(body.formats ? { formats: JSON.stringify(body.formats) } : {}),
        ...(body.maxPerDay !== undefined ? { maxPerDay: Math.max(1, Math.min(10, body.maxPerDay)) } : {}),
        ...(body.templateStrategy ? { templateStrategy: body.templateStrategy } : {}),
        ...(body.autoVideo !== undefined ? { autoVideo: body.autoVideo } : {}),
      },
    })
    return Response.json({ success: true, config: { ...cfg, networks: J(cfg.networks, []), formats: J(cfg.formats, []) } })
  } catch (error) { return errorResponse(error) }
}
