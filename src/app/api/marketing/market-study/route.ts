// ═══════════════════════════════════════════════════════════════
// GET  /api/marketing/market-study?workspaceId=  → estudio (cache ≤7 días)
// POST /api/marketing/market-study               → regenera y cachea
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { generateMarketStudy } from '@/lib/marketing/market-study'

async function ensureConfig(workspaceId: string) {
  const c = await db.marketingBotConfig.findUnique({ where: { workspaceId } })
  return c || db.marketingBotConfig.create({ data: { workspaceId } })
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const cfg = await ensureConfig(workspaceId)
    const fresh = cfg.marketStudyAt && Date.now() - new Date(cfg.marketStudyAt).getTime() < 7 * 86_400_000
    if (cfg.marketStudy && fresh) {
      try { return Response.json({ study: JSON.parse(cfg.marketStudy), cached: true }) } catch { /* regenerar */ }
    }
    const study = await generateMarketStudy(workspaceId)
    await db.marketingBotConfig.update({ where: { workspaceId }, data: { marketStudy: JSON.stringify(study), marketStudyAt: new Date() } })
    return Response.json({ study, cached: false })
  } catch (error) { return errorResponse(error) }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId } = await req.json() as { workspaceId: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'analytics.view')
    await ensureConfig(workspaceId)
    const study = await generateMarketStudy(workspaceId)
    await db.marketingBotConfig.update({ where: { workspaceId }, data: { marketStudy: JSON.stringify(study), marketStudyAt: new Date() } })
    return Response.json({ success: true, study })
  } catch (error) { return errorResponse(error) }
}
