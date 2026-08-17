// ═══════════════════════════════════════════════════════════════
// Aprendizaje del bot de marketing — el bot mejora solo con sus resultados:
//  1. Una vez al día lee las métricas REALES (likes/comentarios/compartidos)
//     de sus publicaciones de los últimos 30 días vía Graph API.
//  2. Agrega por hora local, plantilla y red → settings.marketing.learning.
//  3. El bot usa lo aprendido: publica también en sus mejores horas reales,
//     prefiere la plantilla ganadora y le da a la IA ejemplos de captions
//     que ya funcionaron con SU audiencia.
//  4. Lunes por la mañana: reporte semanal por Telegram al equipo.
// Sin datos suficientes, el bot sigue con las reglas fijas (BEST_TIMES).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { readMetaCreds, type MetaCreds } from './meta'
import { broadcastToWorkspace } from '@/lib/telegram'

const GRAPH = 'https://graph.facebook.com/v21.0'
const MIN_SAMPLE_HOURS = 10   // posts medidos para confiar en horas aprendidas
const MIN_SAMPLE_TEMPLATE = 8 // posts medidos para preferir una plantilla

export interface LearnedStats {
  updatedAt: string
  lastRunDate?: string // YYYY-MM-DD local (guard diario)
  sampleSize: number
  totalEngagement: number
  byHour: Record<string, { posts: number; eng: number }>
  byTemplate: Record<string, { posts: number; eng: number }>
  byNetwork: Record<string, { posts: number; eng: number }>
  topHours: number[]
  bestTemplate: string | null
  topCaptions: string[]
  bestPost: { carName?: string; network: string; eng: number; likes: number; comments: number } | null
}

/** Lee los agregados aprendidos desde el settings JSON del workspace. */
export function readLearnedStats(settingsJson: string | null | undefined): LearnedStats | null {
  try {
    const s = JSON.parse(settingsJson || '{}')
    const l = s?.marketing?.learning
    return l && typeof l === 'object' && typeof l.sampleSize === 'number' ? (l as LearnedStats) : null
  } catch { return null }
}

/** ¿La hora actual es una de las mejores horas APRENDIDAS de este negocio? */
export function isLearnedOptimal(learn: LearnedStats | null, date: Date, tz: string): boolean {
  if (!learn || learn.sampleSize < MIN_SAMPLE_HOURS || !learn.topHours?.length) return false
  return learn.topHours.includes(localHour(date, tz))
}

function localHour(date: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(date)
  return Number(h) % 24
}
function localDay(date: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
}
function localDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// ─── Métricas por publicación (Graph) ─────────────────────────

interface PostEngagement { eng: number; likes: number; comments: number }

async function graphGetJson(path: string, fields: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${GRAPH}/${path}?fields=${fields}&access_token=${token}`)
    const j = await r.json().catch(() => null)
    return r.ok && j ? (j as Record<string, unknown>) : null
  } catch { return null }
}

async function fetchEngagement(network: string, postId: string, creds: MetaCreds): Promise<PostEngagement | null> {
  if (network === 'facebook' && creds.fbToken) {
    const d = await graphGetJson(postId, 'likes.summary(true),comments.summary(true),shares', creds.fbToken)
    if (!d) return null
    const likes = Number((d.likes as { summary?: { total_count?: number } })?.summary?.total_count || 0)
    const comments = Number((d.comments as { summary?: { total_count?: number } })?.summary?.total_count || 0)
    const shares = Number((d.shares as { count?: number })?.count || 0)
    return { eng: likes + comments * 2 + shares * 3, likes, comments }
  }
  if (network === 'instagram' && creds.igToken) {
    const d = await graphGetJson(postId, 'like_count,comments_count', creds.igToken)
    if (!d) return null
    const likes = Number(d.like_count || 0)
    const comments = Number(d.comments_count || 0)
    return { eng: likes + comments * 2, likes, comments }
  }
  return null
}

// ─── Recolección + agregado diario por workspace ──────────────

async function learnForWorkspace(workspaceId: string, settingsJson: string | null, tz: string): Promise<LearnedStats | null> {
  const creds = readMetaCreds(settingsJson)
  if (!creds.fbToken && !creds.igToken) return null

  // Historias expiran a las 24h y no tienen likes → solo feed y reels miden.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const posts = await db.marketingPost.findMany({
    where: { workspaceId, status: 'ok', postId: { not: null }, format: { in: ['feed', 'reel'] }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { postId: true, network: true, template: true, caption: true, carId: true, createdAt: true },
  })
  if (!posts.length) return null

  const byHour: LearnedStats['byHour'] = {}
  const byTemplate: LearnedStats['byTemplate'] = {}
  const byNetwork: LearnedStats['byNetwork'] = {}
  const measured: { eng: number; likes: number; comments: number; caption: string | null; carId: string | null; network: string }[] = []

  for (const p of posts) {
    const m = await fetchEngagement(p.network, p.postId!, creds)
    if (!m) continue
    measured.push({ ...m, caption: p.caption, carId: p.carId, network: p.network })
    const h = String(localHour(p.createdAt, tz))
    const t = p.template || 'clasica'
    for (const [map, key] of [[byHour, h], [byTemplate, t], [byNetwork, p.network]] as const) {
      map[key] = map[key] || { posts: 0, eng: 0 }
      map[key].posts++; map[key].eng += m.eng
    }
  }
  if (!measured.length) return null

  const sampleSize = measured.length
  const totalEngagement = measured.reduce((a, m) => a + m.eng, 0)

  // Mejores horas: promedio de engagement por hora (mín. 2 posts por hora)
  const topHours = sampleSize >= MIN_SAMPLE_HOURS
    ? Object.entries(byHour)
        .filter(([, v]) => v.posts >= 2 && v.eng > 0)
        .sort((a, b) => b[1].eng / b[1].posts - a[1].eng / a[1].posts)
        .slice(0, 3).map(([h]) => Number(h))
    : []

  // Plantilla ganadora: mejor promedio con mín. 3 posts
  const bestTemplate = sampleSize >= MIN_SAMPLE_TEMPLATE
    ? (Object.entries(byTemplate)
        .filter(([, v]) => v.posts >= 3 && v.eng > 0)
        .sort((a, b) => b[1].eng / b[1].posts - a[1].eng / a[1].posts)[0]?.[0] ?? null)
    : null

  // Captions ganadores (ejemplos de estilo para la IA)
  const topCaptions = [...measured]
    .filter((m) => m.caption && m.eng > 0)
    .sort((a, b) => b.eng - a.eng)
    .slice(0, 3).map((m) => String(m.caption).slice(0, 300))

  const top = [...measured].sort((a, b) => b.eng - a.eng)[0]
  let bestPost: LearnedStats['bestPost'] = null
  if (top && top.eng > 0) {
    let carName: string | undefined
    if (top.carId) {
      const car = await db.catalogItem.findUnique({ where: { id: top.carId }, select: { name: true } }).catch(() => null)
      carName = car?.name
    }
    bestPost = { carName, network: top.network, eng: top.eng, likes: top.likes, comments: top.comments }
  }

  return {
    updatedAt: new Date().toISOString(),
    sampleSize, totalEngagement, byHour, byTemplate, byNetwork,
    topHours, bestTemplate, topCaptions, bestPost,
  }
}

// ─── Reporte semanal por Telegram ─────────────────────────────

function weeklyReportText(wsName: string, l: LearnedStats): string {
  const hours = l.topHours.length ? l.topHours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ') : 'aún juntando datos'
  const nets = Object.entries(l.byNetwork).map(([n, v]) => `${n === 'facebook' ? 'Facebook' : 'Instagram'}: ${v.eng} pts en ${v.posts} posts`).join(' · ')
  const best = l.bestPost
    ? `${l.bestPost.carName || 'Auto'} (${l.bestPost.network === 'facebook' ? 'Facebook' : 'Instagram'}) — ${l.bestPost.likes} me gusta, ${l.bestPost.comments} comentarios`
    : 'sin destacado aún'
  return [
    `📊 <b>Reporte semanal de marketing — ${wsName}</b>`,
    '',
    `📈 Publicaciones medidas (30 días): <b>${l.sampleSize}</b> · Interacción total: <b>${l.totalEngagement}</b>`,
    `🏆 Mejor publicación: ${best}`,
    `⏰ Tus mejores horarios reales: <b>${hours}</b>`,
    l.bestTemplate ? `🎨 Diseño que mejor funciona: <b>${l.bestTemplate}</b>` : '',
    nets ? `🌐 ${nets}` : '',
    '',
    'El bot ya usa estos datos para decidir cuándo y cómo publicar.',
  ].filter(Boolean).join('\n')
}

// ─── Barrido principal (lo llama el cron cada 5 min; se autorregula) ──

export async function runMarketingLearning(): Promise<{ learned: number; reports: number }> {
  const workspaces = await db.workspace.findMany({
    where: { isActive: true },
    select: { id: true, name: true, settings: true },
  })
  let learned = 0, reports = 0

  for (const ws of workspaces) {
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws.settings || '{}') } catch { /* */ }
    const mk = (s.marketing as Record<string, unknown>) || {}
    const tz = (s.timezone as string) || 'America/Mexico_City'
    const now = new Date()
    const today = localDate(now, tz)
    const existing = (mk.learning as LearnedStats | undefined) || undefined

    let dirty = false

    // (a) Recolección diaria (primera corrida del cron después de medianoche local)
    if (existing?.lastRunDate !== today) {
      const stats = await learnForWorkspace(ws.id, ws.settings, tz).catch(() => null)
      if (stats) {
        mk.learning = { ...stats, lastRunDate: today }
        dirty = true; learned++
      } else if (existing) {
        existing.lastRunDate = today // sin datos nuevos: no reintentar todo el día
        mk.learning = existing
        dirty = true
      }
    }

    // (b) Reporte semanal: lunes a partir de las 9am local, una vez por semana
    const learn = (mk.learning as LearnedStats | undefined) || undefined
    if (learn && learn.sampleSize > 0 && localDay(now, tz) === 1 && localHour(now, tz) >= 9 && mk.learningReportDate !== today) {
      await broadcastToWorkspace(ws.id, weeklyReportText(ws.name, learn)).catch(() => {})
      mk.learningReportDate = today
      dirty = true; reports++
    }

    if (dirty) {
      s.marketing = mk
      await db.workspace.update({ where: { id: ws.id }, data: { settings: JSON.stringify(s) } }).catch(() => {})
    }
  }
  return { learned, reports }
}
