// ═══════════════════════════════════════════════════════════════
// Aprobación por Telegram de las publicaciones del PILOTO de marketing
// ("control total", pedido del cliente 2026-07-03).
// Con settings.marketingApproval === 'telegram', el piloto NO publica directo:
// crea un BORRADOR (ScheduledPost status 'awaiting_approval'), genera el
// caption, y manda a Telegram la vista previa con botones
// mk:send:<id> / mk:cancel:<id>. Si nadie responde en N horas (mismo timeout
// que los seguimientos), se publica automáticamente.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { broadcastToWorkspace } from '@/lib/telegram'
import { buildCarCreative } from './creative'
import { generateCaption } from './caption'
import { publishCar } from './publish'

const J = (s: string | null | undefined, d: unknown) => { try { return JSON.parse(s || '') } catch { return d } }

export interface MarketingDraftInput {
  workspaceId: string
  carId: string
  networks: string[]
  formats: string[]
  templates: Record<string, string>
  base: string
}

/** Crea el borrador + caption y notifica a Telegram con botones. */
export async function createMarketingDraft(input: MarketingDraftInput): Promise<{ id: string } | null> {
  const { workspaceId, carId, base } = input
  const [item, ws] = await Promise.all([
    db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
  ])
  if (!item || !ws) return null

  // Caption generado UNA vez (se guarda y se usa tal cual al publicar),
  // con ejemplos de captions que ya funcionaron (aprendizaje del bot)
  let caption = ''
  try {
    const creative = buildCarCreative(item, ws, base)
    const { readLearnedStats } = await import('./learning')
    const c = await generateCaption(creative, 'instagram', undefined, readLearnedStats(ws.settings)?.topCaptions)
    caption = `${c.text}\n\n${c.hashtags.join(' ')}`
  } catch { caption = item.name }

  const draft = await db.scheduledPost.create({
    data: {
      workspaceId, carId,
      networks: JSON.stringify(input.networks),
      formats: JSON.stringify(input.formats.filter((f) => f !== 'reel')), // el reel se decide al publicar
      templates: JSON.stringify(input.templates),
      caption,
      scheduledAt: new Date(),
      status: 'awaiting_approval',
      result: JSON.stringify({ approvalRequestedAt: new Date().toISOString() }),
    },
  })

  const tplFeed = input.templates.feed || 'clasica'
  const preview = `${base.replace(/\/$/, '')}/api/marketing/render?workspaceId=${workspaceId}&carId=${carId}&format=feed&template=${tplFeed}`
  const msg =
    `🎨 <b>Publicación del Piloto pendiente de tu aprobación</b>\n\n` +
    `🚘 <b>${escapeHtml(item.name)}</b>\n` +
    `📣 Redes: ${input.networks.join(' + ')} · Formatos: ${input.formats.filter((f) => f !== 'reel').join(', ')}\n\n` +
    `📝 <i>${escapeHtml(caption.slice(0, 400))}</i>\n\n` +
    `🖼️ Vista previa: ${preview}\n\n` +
    `¿Publicar en tus redes?`
  await broadcastToWorkspace(workspaceId, msg, {
    inline_keyboard: [[
      { text: '✅ Publicar', callback_data: `mk:send:${draft.id}` },
      { text: '❌ Descartar', callback_data: `mk:cancel:${draft.id}` },
    ]],
  }).catch(() => {})
  return { id: draft.id }
}

/** Publica un borrador aprobado (botón, comando o timeout) y actualiza contadores. */
export async function publishMarketingDraft(draftId: string, base: string): Promise<{ ok: boolean; summary: string }> {
  const draft = await db.scheduledPost.findUnique({ where: { id: draftId } })
  if (!draft || draft.status !== 'awaiting_approval') return { ok: false, summary: 'Este borrador ya fue procesado' }
  const networks = J(draft.networks, ['facebook', 'instagram']) as string[]
  const formats = J(draft.formats, ['feed']) as string[]
  const templates = J(draft.templates, {}) as Record<string, string>
  try {
    const { results, published } = await publishCar({
      workspaceId: draft.workspaceId, carId: draft.carId, networks, formats, templates,
      caption: draft.caption || undefined, source: 'bot', base,
    })
    await db.scheduledPost.update({ where: { id: draftId }, data: { status: published > 0 ? 'done' : 'error', result: JSON.stringify(results) } })
    if (published > 0) {
      // contadores del piloto (posts de hoy + rotación de autos)
      const cfg = await db.marketingBotConfig.findUnique({ where: { workspaceId: draft.workspaceId } })
      if (cfg) await db.marketingBotConfig.update({ where: { workspaceId: draft.workspaceId }, data: { postsToday: cfg.postsToday + 1, rotateIndex: cfg.rotateIndex + 1, lastRunDate: new Date().toISOString().slice(0, 10) } }).catch(() => {})
    }
    const errs = results.filter((r) => r.status === 'error').map((r) => `${r.network}/${r.format}: ${r.error}`)
    return { ok: published > 0, summary: published > 0 ? `Publicado en ${published} destino(s)${errs.length ? ` · errores: ${errs.join('; ')}` : ''}` : `No se publicó: ${errs.join('; ') || 'error desconocido'}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    await db.scheduledPost.update({ where: { id: draftId }, data: { status: 'error', result: JSON.stringify({ error: msg }) } }).catch(() => {})
    return { ok: false, summary: `Error al publicar: ${msg}` }
  }
}

export async function cancelMarketingDraft(draftId: string): Promise<boolean> {
  const draft = await db.scheduledPost.findUnique({ where: { id: draftId }, select: { status: true } })
  if (!draft || draft.status !== 'awaiting_approval') return false
  await db.scheduledPost.update({ where: { id: draftId }, data: { status: 'cancelled', result: JSON.stringify({ cancelled: 'descartado desde Telegram' }) } })
  return true
}

/** Borradores de marketing expirados (timeout) → publicar automáticamente. */
export async function processExpiredMarketingDrafts(timeoutHoursDefault = 3): Promise<{ published: number }> {
  let published = 0
  const waiting = await db.scheduledPost.findMany({ where: { status: 'awaiting_approval' }, take: 10 })
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
  for (const d of waiting) {
    try {
      const meta = J(d.result, {}) as { approvalRequestedAt?: string }
      const requestedAt = meta.approvalRequestedAt ? new Date(meta.approvalRequestedAt) : d.createdAt
      let hours = timeoutHoursDefault
      try {
        const ws = await db.workspace.findUnique({ where: { id: d.workspaceId }, select: { settings: true } })
        const v = JSON.parse(ws?.settings || '{}').followUpApprovalTimeoutHours
        if (typeof v === 'number' && v >= 1 && v <= 72) hours = v
      } catch { /* default */ }
      if (Date.now() - requestedAt.getTime() < hours * 3600000) continue
      const r = await publishMarketingDraft(d.id, base)
      if (r.ok) {
        published++
        await broadcastToWorkspace(d.workspaceId, `🕒 <b>Publicación del Piloto enviada automáticamente</b> (sin respuesta en ${hours}h). ${escapeHtml(r.summary)}`).catch(() => {})
      }
    } catch (e) { console.warn('[MarketingApproval] timeout error', d.id, e instanceof Error ? e.message : e) }
  }
  return { published }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
