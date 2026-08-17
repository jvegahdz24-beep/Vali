// ═══════════════════════════════════════════════════════════════
// POST /api/marketing/bot/run — ejecuta el bot autónomo de marketing.
// Modos de auth:
//  - Header `x-cron-secret: <CRON_SECRET>` → corre TODOS los workspaces con
//    bot habilitado (lo llama el cron). Respeta horario óptimo y límite diario.
//  - Usuario autenticado con `force:true` → corre SU workspace ya (manual).
// Elige el siguiente auto, renderiza el creativo, genera caption y publica.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { publishCar } from '@/lib/marketing/publish'
import { createMarketingDraft } from '@/lib/marketing/approval'
import { buildCarReel } from '@/lib/marketing/video'
import { processDueScheduled } from '@/lib/marketing/schedule-runner'
import { isOptimalForAny } from '@/lib/marketing/schedule'
import { readLearnedStats, isLearnedOptimal } from '@/lib/marketing/learning'
import { pickTemplate } from '@/lib/marketing/creative'
import { FEED_TEMPLATES, STORY_TEMPLATES } from '@/lib/marketing/templates'

export const runtime = 'nodejs'
export const maxDuration = 180

const J = (s: string, d: unknown) => { try { return JSON.parse(s) } catch { return d } }
const base = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')

function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function hasPhoto(it: { imageUrl: string | null; metadata: string | null }): boolean {
  if (it.imageUrl) return true
  try { const m = JSON.parse(it.metadata || '{}'); return Array.isArray(m.images) && m.images.length > 0 } catch { return false }
}

interface RunOutcome { workspaceId: string; status: string; reason?: string; car?: string; published?: number; results?: unknown }

async function runForWorkspace(workspaceId: string, force: boolean): Promise<RunOutcome> {
  let cfg = await db.marketingBotConfig.findUnique({ where: { workspaceId } })
  if (!cfg) cfg = await db.marketingBotConfig.create({ data: { workspaceId } })
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  let tz = 'America/Mexico_City'
  try { tz = (JSON.parse(ws?.settings || '{}').timezone as string) || tz } catch { /* */ }

  const networks: string[] = J(cfg.networks, ['facebook', 'instagram'])
  const formats: string[] = J(cfg.formats, ['feed', 'story'])
  const today = todayIn(tz)
  const postsToday = cfg.lastRunDate === today ? cfg.postsToday : 0

  // Aprendizaje: métricas reales de publicaciones pasadas (learning.ts)
  const learn = readLearnedStats(ws?.settings)

  if (!force) {
    if (!cfg.enabled) return { workspaceId, status: 'skip', reason: 'deshabilitado' }
    if (postsToday >= cfg.maxPerDay) return { workspaceId, status: 'skip', reason: 'límite_diario' }
    // Horario: tabla general del mercado MX ∪ mejores horas REALES aprendidas
    // de este negocio (unión: lo aprendido suma ventanas, nunca las quita).
    if (!isOptimalForAny(networks, new Date(), tz) && !isLearnedOptimal(learn, new Date(), tz)) {
      return { workspaceId, status: 'skip', reason: 'fuera_de_horario' }
    }
  }

  // Selección de auto: activos, no vendidos, con foto preferentemente.
  const all = await db.catalogItem.findMany({ where: { workspaceId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, imageUrl: true, metadata: true } })
  const sellable = all.filter((it) => { try { return JSON.parse(it.metadata || '{}').status !== 'vendido' } catch { return true } })
  const withPhoto = sellable.filter(hasPhoto)
  const pool = withPhoto.length ? withPhoto : sellable
  if (!pool.length) return { workspaceId, status: 'skip', reason: 'sin_autos' }
  const car = pool[cfg.rotateIndex % pool.length]

  const templates: Record<string, string> = {}
  if (cfg.templateStrategy && cfg.templateStrategy !== 'auto') {
    templates.feed = cfg.templateStrategy; templates.story = cfg.templateStrategy
  } else {
    templates.feed = FEED_TEMPLATES[pickTemplate(car.id, FEED_TEMPLATES.length)]
    templates.story = STORY_TEMPLATES[pickTemplate(car.id + 's', STORY_TEMPLATES.length)]
    // Aprendizaje: si hay una plantilla claramente ganadora, úsala en la mitad
    // de las publicaciones (la otra mitad sigue rotando para seguir midiendo).
    if (learn?.bestTemplate && (FEED_TEMPLATES as readonly string[]).includes(learn.bestTemplate) && cfg.rotateIndex % 2 === 0) {
      templates.feed = learn.bestTemplate
    }
  }

  // MODO APROBACIÓN POR TELEGRAM (settings.marketingApproval === 'telegram'):
  // el piloto NO publica directo — crea un borrador con vista previa y espera
  // el OK del equipo (botones ✅/❌; si nadie responde en 3h, se publica solo).
  // El "Publicar ahora" manual (force) sí publica directo: ya es acción humana.
  let approvalMode = false
  try { approvalMode = JSON.parse(ws?.settings || '{}').marketingApproval === 'telegram' } catch { /* off */ }
  if (approvalMode && !force) {
    const existing = await db.scheduledPost.findFirst({ where: { workspaceId, status: 'awaiting_approval' }, select: { id: true } })
    if (existing) return { workspaceId, status: 'skip', reason: 'borrador_esperando_aprobación' }
    const draft = await createMarketingDraft({ workspaceId, carId: car.id, networks, formats, templates, base: base() })
    return draft
      ? { workspaceId, status: 'awaiting_approval', car: car.id, reason: 'borrador enviado a Telegram' }
      : { workspaceId, status: 'error', reason: 'no se pudo crear el borrador' }
  }

  // Reel automático (opcional) si IG está en redes
  let videoUrl: string | undefined
  const fmts = [...formats]
  if (cfg.autoVideo && networks.includes('instagram')) {
    try { const v = await buildCarReel({ workspaceId, carId: car.id, base: base() }); videoUrl = `${base()}${v.url}`; if (!fmts.includes('reel')) fmts.push('reel') } catch { /* sin video */ }
  }

  const { results, published } = await publishCar({ workspaceId, carId: car.id, networks, formats: fmts, templates, videoUrl, source: 'bot', base: base() })
  await db.marketingBotConfig.update({ where: { workspaceId }, data: { postsToday: postsToday + 1, rotateIndex: cfg.rotateIndex + 1, lastRunDate: today } })
  return { workspaceId, status: 'ran', car: car.id, published, results }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get('x-cron-secret')
    if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
      const body = await req.json().catch(() => ({})) as { workspaceId?: string }
      if (body.workspaceId) return Response.json({ success: true, results: [await runForWorkspace(body.workspaceId, false)] })
      // 1) Publicaciones agendadas que ya vencieron
      const scheduled = await processDueScheduled(base()).catch((e) => ({ processed: 0, results: [], error: e instanceof Error ? e.message : 'error' }))
      // 2) Bots autónomos habilitados
      const enabled = await db.marketingBotConfig.findMany({ where: { enabled: true }, select: { workspaceId: true } })
      const out: RunOutcome[] = []
      for (const e of enabled) { try { out.push(await runForWorkspace(e.workspaceId, false)) } catch (err) { out.push({ workspaceId: e.workspaceId, status: 'error', reason: err instanceof Error ? err.message : 'error' }) } }
      return Response.json({ success: true, scheduled, ran: out.length, results: out })
    }

    // Manual (usuario autenticado)
    const session = await requireAuth(req)
    const { workspaceId, force } = await req.json() as { workspaceId: string; force?: boolean }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!workspaceId) throw new ApiError(400, 'Falta workspace')
    const result = await runForWorkspace(workspaceId, force !== false)
    return Response.json({ success: result.status === 'ran', result })
  } catch (error) { return errorResponse(error) }
}
