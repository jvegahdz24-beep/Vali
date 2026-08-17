// ═══════════════════════════════════════════════════════════════
// Publicación en Meta (Facebook Pages + Instagram Business) vía Graph API.
// Lee las credenciales de workspace.settings.marketing (las guarda el panel
// de Configuración del módulo Marketing). Publica feed, carrusel e historias.
// ═══════════════════════════════════════════════════════════════

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface MetaCreds {
  fbToken?: string
  pageId?: string
  igToken?: string
  igUserId?: string
}

/** Extrae credenciales de Meta desde el JSON de settings del workspace. */
export function readMetaCreds(settingsJson: string | null | undefined): MetaCreds {
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(settingsJson || '{}') } catch { /* */ }
  const mk = (s.marketing as Record<string, Record<string, string>>) || {}
  const meta = mk.meta || {}
  const ig = mk.instagram || {}
  return {
    fbToken: meta.accessToken || undefined,
    pageId: meta.pageId || undefined,
    igToken: ig.accessToken || meta.accessToken || undefined,
    igUserId: ig.businessAccountId || undefined,
  }
}

export const canPublishFacebook = (c: MetaCreds) => !!(c.fbToken && c.pageId)
export const canPublishInstagram = (c: MetaCreds) => !!(c.igToken && c.igUserId)

async function graphPost(path: string, params: Record<string, string>, token: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (data as { error?: { message?: string; error_user_msg?: string } })?.error
    throw new Error(err?.error_user_msg || err?.message || `Graph API ${res.status}`)
  }
  return data as Record<string, unknown>
}

async function graphGet(path: string, fields: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}?fields=${fields}&access_token=${token}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: { message?: string } })?.error?.message || `Graph API ${res.status}`)
  return data as Record<string, unknown>
}

export interface PublishResult { network: string; format: string; postId?: string; permalink?: string }

// ─── FACEBOOK ─────────────────────────────────────────────────
async function fbUploadPhoto(c: MetaCreds, imageUrl: string, published = false): Promise<string> {
  const d = await graphPost(`${c.pageId}/photos`, { url: imageUrl, published: String(published) }, c.fbToken!)
  return String(d.id)
}

export async function fbPublishFeed(c: MetaCreds, imageUrls: string[], caption: string): Promise<PublishResult> {
  if (imageUrls.length <= 1) {
    const d = await graphPost(`${c.pageId}/photos`, { url: imageUrls[0], caption }, c.fbToken!)
    return { network: 'facebook', format: 'feed', postId: String(d.post_id || d.id) }
  }
  const ids: string[] = []
  for (const u of imageUrls) { ids.push(await fbUploadPhoto(c, u, false)); await sleep(800) }
  const d = await graphPost(`${c.pageId}/feed`, { message: caption, attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))) }, c.fbToken!)
  return { network: 'facebook', format: 'carousel', postId: String(d.id) }
}

export async function fbPublishStory(c: MetaCreds, imageUrl: string): Promise<PublishResult> {
  const photoId = await fbUploadPhoto(c, imageUrl, false)
  const d = await graphPost(`${c.pageId}/photo_stories`, { photo_id: photoId }, c.fbToken!)
  return { network: 'facebook', format: 'story', postId: String(d.post_id || d.id || '') }
}

export async function fbPublishVideo(c: MetaCreds, videoUrl: string, caption: string): Promise<PublishResult> {
  const d = await graphPost(`${c.pageId}/videos`, { file_url: videoUrl, description: caption }, c.fbToken!)
  return { network: 'facebook', format: 'video', postId: String(d.id || '') }
}

/** Post de SOLO TEXTO en la Página (para "publicar directo" del generador). */
export async function fbPublishText(c: MetaCreds, message: string): Promise<PublishResult> {
  const d = await graphPost(`${c.pageId}/feed`, { message }, c.fbToken!)
  return { network: 'facebook', format: 'text', postId: String(d.id || '') }
}

// ─── INSTAGRAM ────────────────────────────────────────────────
async function igWaitContainer(c: MetaCreds, id: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const d = await graphGet(id, 'status_code', c.igToken!)
    const code = String(d.status_code || '')
    if (code === 'FINISHED') return
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`Instagram no pudo procesar el medio (${code})`)
    await sleep(4000)
  }
  throw new Error('Instagram tardó demasiado en procesar el medio')
}

async function igPublish(c: MetaCreds, creationId: string): Promise<string> {
  const d = await graphPost(`${c.igUserId}/media_publish`, { creation_id: creationId }, c.igToken!)
  return String(d.id)
}

export async function igPublishFeed(c: MetaCreds, imageUrls: string[], caption: string): Promise<PublishResult> {
  let creationId: string
  let format = 'feed'
  if (imageUrls.length <= 1) {
    const d = await graphPost(`${c.igUserId}/media`, { image_url: imageUrls[0], caption }, c.igToken!)
    creationId = String(d.id)
  } else {
    const children: string[] = []
    for (const u of imageUrls) {
      const d = await graphPost(`${c.igUserId}/media`, { image_url: u, is_carousel_item: 'true' }, c.igToken!)
      children.push(String(d.id)); await sleep(1000)
    }
    const car = await graphPost(`${c.igUserId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, c.igToken!)
    creationId = String(car.id); format = 'carousel'
  }
  await igWaitContainer(c, creationId)
  return { network: 'instagram', format, postId: await igPublish(c, creationId) }
}

export async function igPublishStory(c: MetaCreds, imageUrl: string): Promise<PublishResult> {
  const d = await graphPost(`${c.igUserId}/media`, { image_url: imageUrl, media_type: 'STORIES' }, c.igToken!)
  await igWaitContainer(c, String(d.id))
  return { network: 'instagram', format: 'story', postId: await igPublish(c, String(d.id)) }
}

export async function igPublishReel(c: MetaCreds, videoUrl: string, caption: string): Promise<PublishResult> {
  const d = await graphPost(`${c.igUserId}/media`, { media_type: 'REELS', video_url: videoUrl, caption }, c.igToken!)
  await igWaitContainer(c, String(d.id), 180_000)
  return { network: 'instagram', format: 'reel', postId: await igPublish(c, String(d.id)) }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── MÉTRICAS (F2, 2026-07-22): insights de cada publicación (alcance, likes,
// comentarios) traídos de Meta, para cerrar el círculo en Optimización. ──
export interface PostMetrics { likes: number; comments: number; shares: number; reach: number }

export async function fbPostMetrics(c: MetaCreds, postId: string): Promise<PostMetrics | null> {
  if (!c.fbToken) return null
  try {
    const d = await graphGet(postId, 'likes.summary(true),comments.summary(true),shares', c.fbToken)
    const likes = ((d.likes as { summary?: { total_count?: number } })?.summary?.total_count) || 0
    const comments = ((d.comments as { summary?: { total_count?: number } })?.summary?.total_count) || 0
    const shares = ((d.shares as { count?: number })?.count) || 0
    let reach = 0
    try {
      const ins = await graphGet(`${postId}/insights/post_impressions_unique`, 'values', c.fbToken)
      reach = Number((((ins.data as unknown[])?.[0] as { values?: { value?: number }[] })?.values?.[0]?.value) || 0)
    } catch { /* insights puede no estar disponible en todos los posts */ }
    return { likes, comments, shares, reach }
  } catch { return null }
}

export async function igMediaMetrics(c: MetaCreds, mediaId: string): Promise<PostMetrics | null> {
  if (!c.igToken) return null
  try {
    const d = await graphGet(mediaId, 'like_count,comments_count', c.igToken)
    const likes = Number(d.like_count || 0)
    const comments = Number(d.comments_count || 0)
    let reach = 0
    try {
      const ins = await graphGet(`${mediaId}/insights`, 'reach', c.igToken) as { data?: { name: string; values?: { value?: number }[] }[] }
      reach = Number(ins.data?.find((x) => x.name === 'reach')?.values?.[0]?.value || 0)
    } catch { /* */ }
    return { likes, comments, shares: 0, reach }
  } catch { return null }
}

// Comentarios sin responder de un post de Facebook (para auto-respuesta F3).
export interface FbComment { id: string; from?: string; message: string; created: string }
export async function fbPostComments(c: MetaCreds, postId: string, limit = 25): Promise<FbComment[]> {
  if (!c.fbToken) return []
  try {
    const d = await graphGet(`${postId}/comments`, `from,message,created_time,comment_count&limit=${limit}&order=reverse_chronological`, c.fbToken) as { data?: { id: string; from?: { name?: string }; message?: string; created_time?: string }[] }
    return (d.data || []).map((x) => ({ id: x.id, from: x.from?.name, message: x.message || '', created: x.created_time || '' }))
  } catch { return [] }
}

export async function fbReplyComment(c: MetaCreds, commentId: string, message: string): Promise<boolean> {
  if (!c.fbToken) return false
  try { await graphPost(`${commentId}/comments`, { message }, c.fbToken); return true } catch { return false }
}

// Publicar en el ESTADO de WhatsApp se hace vía Baileys (no Meta Graph) — ver
// connection.ts. Aquí solo van las de Meta.
