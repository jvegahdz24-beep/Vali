// ═══════════════════════════════════════════════════════════════
// TikTok Content Posting v1 (listo-para-credenciales, patrón Mercado Libre).
// Requiere una app en developers.tiktok.com con Login Kit + Content Posting
// API aprobada. Credenciales por workspace en settings.marketing.tiktok:
//   { clientKey, clientSecret, accessToken, refreshToken, openId,
//     expiresAt, refreshExpiresAt, username }
// Publicación: Direct Post con PULL_FROM_URL (nuestros reels ya son URLs
// públicas → TikTok descarga el video él mismo).
// Redirect URI a registrar en la app: https://valiautoflow.com/api/tiktok/callback
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

const AUTH = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/'
const API = 'https://open.tiktokapis.com/v2'
const SCOPES = 'user.info.basic,video.publish'

export interface TikTokCfg {
  clientKey?: string; clientSecret?: string
  accessToken?: string; refreshToken?: string; openId?: string
  expiresAt?: string; username?: string
}

export function readTikTok(settingsJson: string | null | undefined): TikTokCfg {
  let cfg: TikTokCfg = {}
  try { cfg = ((JSON.parse(settingsJson || '{}').marketing || {}).tiktok || {}) as TikTokCfg } catch { /* */ }
  // App de PLATAFORMA (una sola para todos los tenants): si están en env, se
  // usan esas y cada tenant solo autoriza su cuenta (no pega llaves). Si no,
  // cae a las llaves por-tenant (config manual avanzada).
  return {
    ...cfg,
    clientKey: process.env.TIKTOK_CLIENT_KEY || cfg.clientKey,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || cfg.clientSecret,
  }
}
export const tiktokConnected = (c: TikTokCfg) => !!(c.accessToken && c.openId)
export const tiktokHasApp = (c: TikTokCfg) => !!(c.clientKey && c.clientSecret)

export function tiktokAuthUrl(clientKey: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({ client_key: clientKey, response_type: 'code', scope: SCOPES, redirect_uri: redirectUri, state })
  return `${AUTH}?${p.toString()}`
}

async function saveTikTok(workspaceId: string, patch: Partial<TikTokCfg>): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
  const mk = (s.marketing as Record<string, unknown>) || {}
  mk.tiktok = { ...((mk.tiktok as object) || {}), ...patch }
  s.marketing = mk
  await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
}

export async function tiktokExchangeCode(workspaceId: string, code: string, redirectUri: string): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  const cfg = readTikTok(ws?.settings)
  if (!tiktokHasApp(cfg)) throw new Error('Faltan Client Key/Secret de TikTok')
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: cfg.clientKey!, client_secret: cfg.clientSecret!, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
  })
  const j = await r.json() as { access_token?: string; refresh_token?: string; open_id?: string; expires_in?: number; error_description?: string }
  if (!j.access_token) throw new Error(j.error_description || 'TikTok no devolvió token')
  await saveTikTok(workspaceId, {
    accessToken: j.access_token, refreshToken: j.refresh_token, openId: j.open_id,
    expiresAt: new Date(Date.now() + ((j.expires_in || 86400) - 300) * 1000).toISOString(),
  })
}

async function freshToken(workspaceId: string): Promise<TikTokCfg> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  const cfg = readTikTok(ws?.settings)
  if (!tiktokConnected(cfg)) throw new Error('TikTok no está conectado')
  if (cfg.expiresAt && new Date(cfg.expiresAt) > new Date()) return cfg
  // refresh
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: cfg.clientKey!, client_secret: cfg.clientSecret!, grant_type: 'refresh_token', refresh_token: cfg.refreshToken || '' }),
  })
  const j = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!j.access_token) throw new Error('No se pudo refrescar el token de TikTok — reconecta la cuenta')
  const patch = { accessToken: j.access_token, refreshToken: j.refresh_token || cfg.refreshToken, expiresAt: new Date(Date.now() + ((j.expires_in || 86400) - 300) * 1000).toISOString() }
  await saveTikTok(workspaceId, patch)
  return { ...cfg, ...patch }
}

/** Consulta creator_info: devuelve la lista de privacy_level permitidos. */
async function tiktokPrivacyLevel(accessToken: string): Promise<string> {
  // TikTok EXIGE que privacy_level sea uno de los valores que la cuenta permite
  // (creator_info). Apps en SANDBOX o sin auditar NO incluyen PUBLIC_TO_EVERYONE
  // → si mandamos público, TikTok responde el error de "content-sharing-guidelines".
  // Elegimos PUBLIC_TO_EVERYONE si está disponible (app auditada); si no, SELF_ONLY
  // (privado). Así funciona igual en sandbox y en producción auditada, sin depender
  // del prefijo del client key ni de variables de entorno.
  try {
    const ci = await fetch(`${API}/post/publish/creator_info/query/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    })
    const cj = await ci.json() as { data?: { privacy_level_options?: string[] } }
    const opts = cj?.data?.privacy_level_options || []
    if (opts.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE'
    if (opts.includes('SELF_ONLY')) return 'SELF_ONLY'
    if (opts.length) return opts[0]
  } catch { /* usa fallback */ }
  return 'SELF_ONLY'
}

/** Publica un video (Direct Post) desde una URL pública. Devuelve publish_id. */
export async function tiktokPublishVideo(workspaceId: string, videoUrl: string, title: string): Promise<string> {
  const cfg = await freshToken(workspaceId)
  const privacy = await tiktokPrivacyLevel(cfg.accessToken!)
  const r = await fetch(`${API}/post/publish/video/init/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accessToken}` },
    body: JSON.stringify({
      post_info: { title: title.slice(0, 150), privacy_level: privacy },
      source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
    }),
  })
  const j = await r.json() as { data?: { publish_id?: string }; error?: { code?: string; message?: string } }
  if (j.error?.code && j.error.code !== 'ok') throw new Error(j.error.message || j.error.code)
  if (!j.data?.publish_id) throw new Error('TikTok no devolvió publish_id')
  return j.data.publish_id
}
