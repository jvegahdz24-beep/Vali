// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Cliente de Mercado Libre.
// OAuth (autorización + refresh automático de token) y métodos de la
// API: items (publicar/editar/pausar), preguntas, órdenes, envíos.
// Credenciales por-workspace (MeliConnection). País por defecto: MLM (México).
// Docs: https://developers.mercadolibre.com.mx
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import crypto from 'crypto'

const API = 'https://api.mercadolibre.com'
// Dominio de autorización por sitio (login del vendedor)
const AUTH_DOMAIN: Record<string, string> = {
  MLM: 'https://auth.mercadolibre.com.mx',
  MLA: 'https://auth.mercadolibre.com.ar',
  MCO: 'https://auth.mercadolibre.com.co',
  MLC: 'https://auth.mercadolibre.cl',
  MLB: 'https://auth.mercadolivre.com.br',
  MPE: 'https://auth.mercadolibre.com.pe',
}

export interface MeliConn {
  id: string; workspaceId: string; siteId: string
  appId: string | null; appSecret: string | null; redirectUri: string | null
  accessToken: string | null; refreshToken: string | null; expiresAt: Date | null
  meliUserId: string | null; nickname: string | null; status: string
  codeVerifier?: string | null
}

// ─── PKCE (Mercado Libre exige code_challenge/code_verifier desde 2025) ───
const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** Genera el par PKCE: verifier (se guarda) y challenge S256 (va en la authUrl). */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(48)) // ~64 chars, dentro de 43–128
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/**
 * Credenciales de la App de ML a nivel PLATAFORMA (una sola app para todo
 * ValiAutoFlow). Si están configuradas, cada workspace conecta con un clic
 * sin tener que crear su propia app de desarrollador. Se configuran una vez
 * en el entorno: MELI_APP_ID / MELI_APP_SECRET.
 */
export function platformCreds(): { appId: string; appSecret: string } | null {
  const appId = (process.env.MELI_APP_ID || '').trim()
  const appSecret = (process.env.MELI_APP_SECRET || '').trim()
  return appId && appSecret ? { appId, appSecret } : null
}

/** Resuelve las credenciales efectivas: plataforma primero, luego por-workspace. */
function resolveCreds(conn: { appId: string | null; appSecret: string | null }): { appId: string; appSecret: string } | null {
  const plat = platformCreds()
  if (plat) return plat
  return conn.appId && conn.appSecret ? { appId: conn.appId, appSecret: conn.appSecret } : null
}

export function authUrl(appId: string, redirectUri: string, siteId: string, state: string, codeChallenge?: string): string {
  const base = AUTH_DOMAIN[siteId] || AUTH_DOMAIN.MLM
  const params = new URLSearchParams({ response_type: 'code', client_id: appId, redirect_uri: redirectUri, state })
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }
  return `${base}/authorization?${params.toString()}`
}

interface TokenResp { access_token: string; refresh_token: string; expires_in: number; user_id: number; scope: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResp> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || data?.error_description || `OAuth error ${res.status}`)
  return data as TokenResp
}

/** Intercambia el code del callback por tokens y los guarda. */
export async function exchangeCode(conn: MeliConn, code: string): Promise<void> {
  const creds = resolveCreds(conn)
  if (!creds || !conn.redirectUri) throw new Error('Faltan credenciales de la App de ML (configura MELI_APP_ID/MELI_APP_SECRET)')
  if (!conn.codeVerifier) throw new Error('Falta el code_verifier de PKCE; vuelve a iniciar la conexión con Mercado Libre')
  const t = await tokenRequest({
    grant_type: 'authorization_code', client_id: creds.appId, client_secret: creds.appSecret,
    code, redirect_uri: conn.redirectUri, code_verifier: conn.codeVerifier,
  })
  // Datos del usuario ML
  let nickname: string | null = null
  try {
    const me = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json())
    nickname = me?.nickname ?? null
  } catch { /* ignore */ }
  await db.meliConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: t.access_token, refreshToken: t.refresh_token,
      expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
      meliUserId: String(t.user_id), nickname, scope: t.scope, status: 'connected', lastError: null,
      codeVerifier: null,
    },
  })
}

/** Devuelve un access_token válido (refresca si está por expirar). */
export async function getValidToken(conn: MeliConn): Promise<string> {
  if (!conn.accessToken) throw new Error('Cuenta de Mercado Libre no conectada')
  const fresh = conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000
  if (fresh) return conn.accessToken
  const creds = resolveCreds(conn)
  if (!conn.refreshToken || !creds) throw new Error('No se puede refrescar el token de ML')
  const t = await tokenRequest({
    grant_type: 'refresh_token', client_id: creds.appId, client_secret: creds.appSecret, refresh_token: conn.refreshToken,
  })
  await db.meliConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: t.access_token, refreshToken: t.refresh_token,
      expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), status: 'connected', lastError: null,
    },
  })
  conn.accessToken = t.access_token
  return t.access_token
}

export async function loadConnection(workspaceId: string): Promise<MeliConn | null> {
  return db.meliConnection.findUnique({ where: { workspaceId } }) as unknown as MeliConn | null
}

/** Petición autenticada a la API de ML (refresca token si hace falta). */
export async function meli<T = unknown>(conn: MeliConn, path: string, init?: RequestInit): Promise<T> {
  const token = await getValidToken(conn)
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', accept: 'application/json', ...(init?.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string })?.message || (data as { error?: string })?.error || `Error ML ${res.status}`
    const cause = (data as { cause?: { message?: string }[] })?.cause?.map((c) => c.message).filter(Boolean).join('; ')
    throw new Error(cause ? `${msg}: ${cause}` : msg)
  }
  return data as T
}

// ─── Helpers de dominio ───────────────────────────────────────

export const meliApi = {
  me: (conn: MeliConn) => meli(conn, '/users/me'),
  getItem: (conn: MeliConn, id: string) => meli(conn, `/items/${id}`),
  createItem: (conn: MeliConn, payload: unknown) => meli(conn, '/items', { method: 'POST', body: JSON.stringify(payload) }),
  setDescription: (conn: MeliConn, itemId: string, plainText: string) => meli(conn, `/items/${itemId}/description`, { method: 'POST', body: JSON.stringify({ plain_text: plainText }) }),
  updateItem: (conn: MeliConn, id: string, payload: unknown) => meli(conn, `/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  sellerItems: (conn: MeliConn, offset = 0, limit = 50) => meli(conn, `/users/${conn.meliUserId}/items/search?offset=${offset}&limit=${limit}`),
  // Preguntas
  questions: (conn: MeliConn, status = 'UNANSWERED', limit = 50) => meli(conn, `/questions/search?seller_id=${conn.meliUserId}&status=${status}&sort_fields=date_created&sort_types=DESC&limit=${limit}`),
  answer: (conn: MeliConn, questionId: string, text: string) => meli(conn, '/answers', { method: 'POST', body: JSON.stringify({ question_id: Number(questionId), text }) }),
  // Órdenes / ventas
  orders: (conn: MeliConn, offset = 0, limit = 50) => meli(conn, `/orders/search?seller=${conn.meliUserId}&sort=date_desc&offset=${offset}&limit=${limit}`),
  order: (conn: MeliConn, id: string) => meli(conn, `/orders/${id}`),
  shipment: (conn: MeliConn, id: string) => meli(conn, `/shipments/${id}`),
}

// ─── Mapeo Auto (CatalogItem) → item de ML ────────────────────
// Categoría HOJA de autos en México: MLM1744 (Autos y Camionetas). ⚠️ MLM1743 es
// la categoría PADRE y ML rechaza publicar ahí ("posting in a leaf category").
// Requisitos verificados contra POST /items/validate (2026-07-01, HTTP 204):
// categoría hoja + location (país/estado/ciudad) + atributos BRAND/MODEL/
// VEHICLE_YEAR/KILOMETERS/FUEL_TYPE/DOORS/TRIM. listing_type 'free' publica
// gratis; 'silver' queda en payment_required hasta pagar en ML.

const CATEGORY_BY_SITE: Record<string, string> = { MLM: 'MLM1744', MLA: 'MLA1744', MCO: 'MCO1744', MLC: 'MLC1744', MLB: 'MLB1744' }
const COUNTRY_BY_SITE: Record<string, string> = { MLM: 'México', MLA: 'Argentina', MCO: 'Colombia', MLC: 'Chile', MLB: 'Brasil', MPE: 'Perú' }

/** Parsea "Cancún, Quintana Roo[, México]" → location de ML (city/state/country por nombre). */
export function parseMeliLocation(ubicacion: string | null | undefined, siteId = 'MLM'):
  { city: { name: string }; state: { name: string }; country: { name: string } } | null {
  const parts = String(ubicacion || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const [city, state, country] = parts
  return { city: { name: city }, state: { name: state }, country: { name: country || COUNTRY_BY_SITE[siteId] || 'México' } }
}

interface CatalogItemLike {
  name: string; price: number | null; currency?: string | null; category?: string | null
  description?: string | null; imageUrl?: string | null
  metadata: Record<string, unknown>
}

const attr = (id: string, value: unknown) => value != null && String(value).trim() !== '' ? { id, value_name: String(value) } : null

export function vehicleToMeliItem(item: CatalogItemLike, siteId: string): Record<string, unknown> {
  const m = item.metadata || {}
  const images: string[] = Array.isArray(m.images) ? (m.images as string[]) : (item.imageUrl ? [item.imageUrl] : [])
  const condition = /seminuevo|usado/i.test(item.category || '') ? 'used' : 'new'
  const attributes = [
    attr('BRAND', m.marca),
    attr('MODEL', m.modelo),
    attr('VEHICLE_YEAR', m.year),
    // KILOMETERS es requerido: autos nuevos sin captura → "0 km"
    attr('KILOMETERS', `${String(m.km ?? '0').replace(/[^\d]/g, '') || '0'} km`),
    attr('FUEL_TYPE', m.combustible),
    attr('TRANSMISSION', m.transmision),
    attr('DOORS', m.puertas),
    attr('TRIM', m.version), // "Versión" — requerido por MLM1744
    attr('TRACTION_CONTROL', m.traccion),
    attr('ENGINE', m.motor),
    attr('COLOR', m.colorExterior || m.color),
  ].filter(Boolean)

  const location = parseMeliLocation(m.ubicacion as string | undefined, siteId)

  return {
    title: item.name.slice(0, 60),
    category_id: CATEGORY_BY_SITE[siteId] || CATEGORY_BY_SITE.MLM,
    price: item.price ?? 0,
    currency_id: item.currency || (siteId === 'MLM' ? 'MXN' : 'USD'),
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: 'free', // gratuita: publica sin exigir pago (silver → payment_required)
    condition,
    // La descripción se publica APARTE (POST /items/{id}/description) tras crear.
    pictures: images.slice(0, 12).map((source) => ({ source })),
    attributes,
    ...(location ? { location } : {}),
  }
}
