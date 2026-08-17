// ═══════════════════════════════════════════════════════════════
// Publicar un auto en redes (Meta). Lógica compartida por la ruta manual
// (/api/marketing/publish) y el bot autónomo (/api/marketing/bot/run).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { buildCarCreative } from './creative'
import { generateCaption } from './caption'
import { readLearnedStats } from './learning'
import {
  readMetaCreds, canPublishFacebook, canPublishInstagram,
  fbPublishFeed, fbPublishStory, igPublishFeed, igPublishStory, igPublishReel, type PublishResult,
} from './meta'

export interface PublishOpts {
  workspaceId: string
  carId: string
  networks?: string[]
  formats?: string[] // feed | story | reel
  templates?: Record<string, string>
  caption?: string
  videoUrl?: string // para reels
  source?: string
  base: string
}

export interface PublishOutcome extends Partial<PublishResult> {
  network: string
  format: string
  status: 'ok' | 'error'
  error?: string
}

const renderUrl = (base: string, ws: string, car: string, format: string, template: string) =>
  `${base.replace(/\/$/, '')}/api/marketing/render?workspaceId=${ws}&carId=${car}&format=${format}&template=${template}`

export async function publishCar(opts: PublishOpts): Promise<{ results: PublishOutcome[]; published: number }> {
  const { workspaceId, carId, base } = opts
  const networks = (opts.networks?.length ? opts.networks : ['facebook', 'instagram']).filter((n) => ['facebook', 'instagram', 'telegram', 'tiktok'].includes(n))
  const formats = (opts.formats?.length ? opts.formats : ['feed', 'story']).filter((f) => ['feed', 'story', 'reel'].includes(f))
  const templates = opts.templates || {}
  const source = opts.source && ['bot', 'scheduled'].includes(opts.source) ? opts.source : 'manual'

  const [item, ws] = await Promise.all([
    db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
  ])
  if (!item || !ws) throw new Error('Auto no encontrado')

  const creds = readMetaCreds(ws.settings)
  const creative = buildCarCreative(item, ws, base)

  // Aprendizaje: ejemplos de captions que ya funcionaron con esta audiencia
  const learnedExamples = readLearnedStats(ws.settings)?.topCaptions

  const captions: Record<string, string> = {}
  for (const n of networks) {
    if (opts.caption) captions[n] = opts.caption
    else { const c = await generateCaption(creative, n === 'facebook' ? 'facebook' : 'instagram', undefined, learnedExamples); captions[n] = `${c.text}\n\n${c.hashtags.join(' ')}` }
  }

  const results: PublishOutcome[] = []
  for (const network of networks) {
    // ── TELEGRAM: publica el creativo (foto + caption) al canal/grupo del tenant ──
    if (network === 'telegram') {
      const cap = captions['telegram'] || Object.values(captions)[0] || ''
      const img = renderUrl(base, workspaceId, carId, 'feed', templates['feed'] || 'clasica')
      const { telegramPublishToChannel } = await import('@/lib/telegram')
      const r = await telegramPublishToChannel(workspaceId, { text: cap, imageUrl: img })
      if (r.ok) {
        results.push({ network, format: 'feed', status: 'ok', postId: String(r.messageId || '') })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format: 'feed', caption: cap, imageUrl: img, postId: String(r.messageId || ''), status: 'ok', source } })
      } else {
        results.push({ network, format: 'feed', status: 'error', error: r.error })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format: 'feed', caption: cap, imageUrl: img, status: 'error', error: r.error, source } })
      }
      continue
    }
    // ── TIKTOK: solo video (Content Posting API). Requiere un video generado. ──
    if (network === 'tiktok') {
      if (!opts.videoUrl) {
        const msg = 'TikTok solo publica video. Genera uno en el Estudio de Video (o activa "Video automático" en el Piloto) antes de publicar a TikTok.'
        results.push({ network, format: 'video', status: 'error', error: msg })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format: 'video', status: 'error', error: msg, source } })
        continue
      }
      try {
        const { tiktokPublishVideo } = await import('./tiktok')
        const cap = captions['tiktok'] || Object.values(captions)[0] || ''
        const publishId = await tiktokPublishVideo(workspaceId, opts.videoUrl, cap || item.name || 'Auto en venta')
        results.push({ network, format: 'video', status: 'ok', postId: publishId })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format: 'video', caption: cap, videoUrl: opts.videoUrl, postId: publishId, status: 'ok', source } })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error de TikTok'
        results.push({ network, format: 'video', status: 'error', error: msg })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format: 'video', videoUrl: opts.videoUrl, status: 'error', error: msg, source } })
      }
      continue
    }
    const ready = network === 'facebook' ? canPublishFacebook(creds) : canPublishInstagram(creds)
    if (!ready) {
      const msg = `${network === 'facebook' ? 'Facebook' : 'Instagram'} no está conectado`
      results.push({ network, format: '-', status: 'error', error: msg })
      await db.marketingPost.create({
        data: { workspaceId, carId, network, format: '-', status: 'error', error: msg, source },
      })
      continue
    }
    for (const format of formats) {
      // Los reels solo existen en Instagram por esta API. En Facebook no se
      // intentan (se omiten en silencio, no es un error que deba alarmar).
      if (format === 'reel' && network !== 'instagram') continue
      // Reel sin video generado: mensaje claro y accionable (no un error críptico).
      if (format === 'reel' && !opts.videoUrl) {
        const msg = 'El reel necesita un video. Activa "Video automático" en el Piloto o genera uno en el Estudio de Video.'
        results.push({ network, format, status: 'error', error: msg })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format, status: 'error', error: msg, source } })
        continue
      }
      const tpl = templates[format] || (format === 'story' ? 'historia' : 'clasica')
      const img = renderUrl(base, workspaceId, carId, format === 'reel' ? 'story' : format, tpl)
      const doPublish = async (): Promise<PublishResult> => {
        if (format === 'reel') return igPublishReel(creds, opts.videoUrl!, captions[network])
        if (network === 'facebook') return format === 'story' ? fbPublishStory(creds, img) : fbPublishFeed(creds, [img], captions[network])
        return format === 'story' ? igPublishStory(creds, img) : igPublishFeed(creds, [img], captions[network])
      }
      try {
        let r: PublishResult
        try {
          r = await doPublish()
        } catch (e1) {
          // Reintento único ante fallos TRANSITORIOS al obtener la imagen del
          // render (típico si Meta la buscó justo durante un redeploy y recibió
          // una página de error). Espera breve y reintenta una vez.
          const m1 = e1 instanceof Error ? e1.message : ''
          if (format !== 'reel' && /could not be processed|couldn't be uploaded|could not be recognized|error page instead of an image|media.*download|fetch/i.test(m1)) {
            await new Promise((res) => setTimeout(res, 3000))
            r = await doPublish()
          } else { throw e1 }
        }
        results.push({ ...r, status: 'ok' })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format: r.format, template: tpl, caption: captions[network], imageUrl: format === 'reel' ? null : img, videoUrl: format === 'reel' ? opts.videoUrl : null, postId: r.postId, status: 'ok', source } })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error'
        results.push({ network, format, status: 'error', error: msg })
        await db.marketingPost.create({ data: { workspaceId, carId, network, format, template: tpl, caption: captions[network], imageUrl: img, status: 'error', error: msg, source } })
      }
    }
  }
  return {
    results,
    published: results.filter((result) => result.status === 'ok').length,
  }
}
