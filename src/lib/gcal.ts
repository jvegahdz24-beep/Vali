// ═══════════════════════════════════════════════════════════════
// Google Calendar v2 — conexión POR USUARIO (cada quien vincula SU cuenta
// con el botón, pedido de Jhon 2026-07-13) + compat con la conexión de
// negocio v1 (settings.googleCalendar).
//
// • Tokens por usuario: settings.googleCalendarUsers = { [userId]: GCalCfg }
// • Las citas se EMPUJAN A TODOS los calendarios conectados del workspace
//   (cada asesor conectado las ve en su propio Google Calendar).
// • Appointment.googleEventId guarda el mapa "clave=eventId|clave=eventId"
//   (clave 'ws' = conexión de negocio, 'u:<userId>' = usuario). Un valor
//   plano legado se interpreta como evento de la conexión 'ws'.
// • Requiere UNA VEZ en .env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (app de
//   Google Cloud con Calendar API y redirect .../api/gcal/callback). Después
//   TODO el flujo por usuario es automático (botón → Google → conectado).
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto'
import { db } from '@/lib/db'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const CAL = 'https://www.googleapis.com/calendar/v3'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export const gcalAppReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
const base = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
export const gcalRedirectUri = () => `${base()}/api/gcal/callback`

export interface GCalCfg { accessToken?: string; refreshToken?: string; expiresAt?: string; email?: string }

export function readGCal(settingsJson: string | null | undefined): GCalCfg {
  try { return (JSON.parse(settingsJson || '{}').googleCalendar || {}) as GCalCfg } catch { return {} }
}
export function readGCalUsers(settingsJson: string | null | undefined): Record<string, GCalCfg> {
  try { return (JSON.parse(settingsJson || '{}').googleCalendarUsers || {}) as Record<string, GCalCfg> } catch { return {} }
}
export const gcalConnected = (c: GCalCfg) => !!c.refreshToken

// ── State OAuth firmado, con expiración, nonce y cookie de correlación ──
// La firma evita manipulación de workspace/usuario; la cookie evita que un
// tercero reutilice un state válido desde otro navegador (CSRF/binding).
export const GCAL_STATE_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Host-valiflow-gcal-state'
  : 'valiflow-gcal-state'
const GCAL_STATE_TTL_SECONDS = 10 * 60
const stateSecret = () => {
  const secret = process.env.NEXTAUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET
  if (!secret) throw new Error('OAuth state secret is not configured')
  return secret
}
const b64url = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const sign = (payload: string) => crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url')

export function gcalState(workspaceId: string, userId: string): string {
  const payload = JSON.stringify({
    workspaceId,
    userId,
    issuedAt: Math.floor(Date.now() / 1000),
    nonce: crypto.randomBytes(16).toString('hex'),
  })
  const encoded = b64url(payload)
  return `${encoded}.${sign(encoded)}`
}

export function gcalParseState(state: string): { workspaceId: string; userId: string; nonce: string } | null {
  try {
    const [encoded, signature, extra] = (state || '').split('.')
    if (!encoded || !signature || extra) return null
    const expected = sign(encoded)
    const expectedBytes = Buffer.from(expected)
    const receivedBytes = Buffer.from(signature)
    if (expectedBytes.length !== receivedBytes.length || !crypto.timingSafeEqual(expectedBytes, receivedBytes)) return null
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      workspaceId?: unknown
      userId?: unknown
      issuedAt?: unknown
      nonce?: unknown
    }
    const now = Math.floor(Date.now() / 1000)
    if (
      typeof payload.workspaceId !== 'string' || !payload.workspaceId ||
      typeof payload.userId !== 'string' || !payload.userId ||
      typeof payload.nonce !== 'string' || !payload.nonce ||
      typeof payload.issuedAt !== 'number' ||
      payload.issuedAt > now + 30 || now - payload.issuedAt > GCAL_STATE_TTL_SECONDS
    ) return null
    return { workspaceId: payload.workspaceId, userId: payload.userId, nonce: payload.nonce }
  } catch {
    return null
  }
}

export function gcalAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '', redirect_uri: gcalRedirectUri(),
    response_type: 'code', scope: `${SCOPE} email`, access_type: 'offline', prompt: 'consent', state,
  })
  return `${AUTH}?${p.toString()}`
}

// ── Persistencia en Workspace.settings ──
async function patchSettings(workspaceId: string, fn: (s: Record<string, unknown>) => void): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
  fn(s)
  await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(s) } })
}

async function saveGCal(workspaceId: string, patch: Partial<GCalCfg> | null): Promise<void> {
  await patchSettings(workspaceId, (s) => {
    if (patch === null) delete s.googleCalendar
    else s.googleCalendar = { ...((s.googleCalendar as object) || {}), ...patch }
  })
}

export async function saveGCalUser(workspaceId: string, userId: string, patch: Partial<GCalCfg> | null): Promise<void> {
  await patchSettings(workspaceId, (s) => {
    const users = (s.googleCalendarUsers as Record<string, GCalCfg>) || {}
    if (patch === null) delete users[userId]
    else users[userId] = { ...(users[userId] || {}), ...patch }
    s.googleCalendarUsers = users
  })
}

/** Canjea el code. Con userId guarda la conexión DEL USUARIO; sin él, la de negocio (legado). */
export async function gcalExchangeCode(workspaceId: string, code: string, userId?: string): Promise<void> {
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      code, grant_type: 'authorization_code', redirect_uri: gcalRedirectUri(),
    }),
  })
  const j = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string }
  if (!j.access_token) throw new Error(j.error_description || 'Google no devolvió token')
  let email = ''
  try {
    const u = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json())
    email = u.email || ''
  } catch { /* opcional */ }
  const cfg: GCalCfg = {
    accessToken: j.access_token, refreshToken: j.refresh_token,
    expiresAt: new Date(Date.now() + ((j.expires_in || 3600) - 120) * 1000).toISOString(), email,
  }
  if (userId) await saveGCalUser(workspaceId, userId, cfg)
  else await saveGCal(workspaceId, cfg)
}

export async function gcalDisconnect(workspaceId: string): Promise<void> { await saveGCal(workspaceId, null) }
export async function gcalDisconnectUser(workspaceId: string, userId: string): Promise<void> { await saveGCalUser(workspaceId, userId, null) }

// ── Conexiones vivas del workspace (usuarios + negocio) ──
interface Conn { key: string; cfg: GCalCfg; persist: (patch: Partial<GCalCfg>) => Promise<void> }

async function connections(workspaceId: string): Promise<Conn[]> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  const out: Conn[] = []
  const legacy = readGCal(ws?.settings)
  if (gcalConnected(legacy)) out.push({ key: 'ws', cfg: legacy, persist: (p) => saveGCal(workspaceId, p) })
  const users = readGCalUsers(ws?.settings)
  for (const [uid, cfg] of Object.entries(users)) {
    if (gcalConnected(cfg)) out.push({ key: `u:${uid}`, cfg, persist: (p) => saveGCalUser(workspaceId, uid, p) })
  }
  return out
}

async function freshTokenFor(conn: Conn): Promise<string | null> {
  const { cfg } = conn
  if (cfg.accessToken && cfg.expiresAt && new Date(cfg.expiresAt) > new Date()) return cfg.accessToken
  const r = await fetch(TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token', refresh_token: cfg.refreshToken || '',
    }),
  })
  const j = await r.json() as { access_token?: string; expires_in?: number }
  if (!j.access_token) return null
  await conn.persist({ accessToken: j.access_token, expiresAt: new Date(Date.now() + ((j.expires_in || 3600) - 120) * 1000).toISOString() }).catch(() => {})
  return j.access_token
}

// ── Mapa de eventos en Appointment.googleEventId ──
// Formato: "ws=abc|u:cmx123=def". Valor plano legado ("abc") = { ws: "abc" }.
function parseEventMap(raw: string | null | undefined): Record<string, string> {
  const s = (raw || '').trim()
  if (!s) return {}
  if (!s.includes('=')) return { ws: s }
  const map: Record<string, string> = {}
  for (const part of s.split('|')) {
    const i = part.indexOf('=')
    if (i > 0) map[part.slice(0, i)] = part.slice(i + 1)
  }
  return map
}
function serializeEventMap(map: Record<string, string>): string {
  let out = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('|')
  // La columna es VARCHAR(191): si algún día hay demasiadas conexiones,
  // conserva las que quepan (las primeras) en lugar de romper el guardado.
  while (out.length > 185 && out.includes('|')) out = out.slice(0, out.lastIndexOf('|'))
  return out
}

interface ApptLike { id: string; title: string; description?: string | null; date: Date; duration: number; googleEventId?: string | null }

/** Crea/actualiza el evento en TODOS los calendarios conectados (usuarios + negocio).
 *  No-op si no hay conexiones. Devuelve el primer eventId (compat). */
export async function gcalPushAppointment(workspaceId: string, appt: ApptLike, timezone: string): Promise<string | null> {
  try {
    const conns = await connections(workspaceId)
    if (conns.length === 0) return null
    const start = new Date(appt.date)
    const end = new Date(start.getTime() + (appt.duration || 30) * 60000)
    const body = JSON.stringify({
      summary: appt.title,
      description: appt.description || 'Cita agendada desde ValiAutoFlow',
      start: { dateTime: start.toISOString(), timeZone: timezone },
      end: { dateTime: end.toISOString(), timeZone: timezone },
    })
    const prevMap = parseEventMap(appt.googleEventId)
    const newMap: Record<string, string> = {}

    for (const conn of conns) {
      try {
        const token = await freshTokenFor(conn)
        if (!token) continue
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        const existingId = prevMap[conn.key]
        let id: string | undefined
        if (existingId) {
          const r = await fetch(`${CAL}/calendars/primary/events/${existingId}`, { method: 'PATCH', headers, body })
          const j = await r.json().catch(() => ({})) as { id?: string }
          if (r.ok && j.id) id = j.id
        }
        if (!id) {
          const r = await fetch(`${CAL}/calendars/primary/events`, { method: 'POST', headers, body })
          const j = await r.json().catch(() => ({})) as { id?: string }
          if (r.ok && j.id) id = j.id
        }
        if (id) newMap[conn.key] = id
      } catch { /* una conexión fallida no debe tumbar a las demás */ }
    }

    if (Object.keys(newMap).length === 0) return null
    const serialized = serializeEventMap(newMap)
    if (serialized !== (appt.googleEventId || '')) {
      await db.appointment.update({ where: { id: appt.id }, data: { googleEventId: serialized } }).catch(() => {})
    }
    return Object.values(newMap)[0] || null
  } catch { return null }
}

/** Borra el evento en TODOS los calendarios donde exista (no-op sin conexión/eventId). */
export async function gcalDeleteEvent(workspaceId: string, googleEventId: string | null | undefined): Promise<void> {
  try {
    const map = parseEventMap(googleEventId)
    if (Object.keys(map).length === 0) return
    const conns = await connections(workspaceId)
    for (const conn of conns) {
      const evtId = map[conn.key]
      if (!evtId) continue
      try {
        const token = await freshTokenFor(conn)
        if (!token) continue
        await fetch(`${CAL}/calendars/primary/events/${evtId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      } catch { /* no crítico */ }
    }
  } catch { /* no crítico */ }
}
