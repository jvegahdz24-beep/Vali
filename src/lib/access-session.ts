// ═══════════════════════════════════════════════════════════════
// ValiGuard — Registro de sesiones/accesos (IP, dispositivo, ubicación).
// Sin dependencias externas: parseo de User-Agent propio + geolocalización
// por headers de Cloudflare (país) y enriquecimiento fire-and-forget (ciudad).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getRequestIp } from '@/lib/audit'

export interface AccessContext {
  ip?: string
  userAgent?: string
  browser?: string
  os?: string
  device?: string
  city?: string
  region?: string
  country?: string
}

/** Parseo ligero de User-Agent → navegador / SO / tipo de dispositivo. */
export function parseUserAgent(ua?: string): { browser: string; os: string; device: string } {
  if (!ua) return { browser: 'Desconocido', os: 'Desconocido', device: 'Desconocido' }
  const u = ua.toLowerCase()

  // Navegador (orden importa: Edge/Opera antes que Chrome; Chrome antes que Safari)
  let browser = 'Desconocido'
  if (u.includes('edg/') || u.includes('edga') || u.includes('edgios')) browser = 'Edge'
  else if (u.includes('opr/') || u.includes('opera')) browser = 'Opera'
  else if (u.includes('firefox') || u.includes('fxios')) browser = 'Firefox'
  else if (u.includes('samsungbrowser')) browser = 'Samsung Internet'
  else if (u.includes('chrome') || u.includes('crios')) browser = 'Chrome'
  else if (u.includes('safari')) browser = 'Safari'

  // Sistema operativo
  let os = 'Desconocido'
  if (u.includes('windows nt 10') || u.includes('windows nt 11')) os = 'Windows 10/11'
  else if (u.includes('windows')) os = 'Windows'
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) os = 'iOS'
  else if (u.includes('android')) os = 'Android'
  else if (u.includes('mac os x') || u.includes('macintosh')) os = 'macOS'
  else if (u.includes('linux')) os = 'Linux'

  // Tipo de dispositivo
  let device = 'Escritorio'
  if (u.includes('ipad') || (u.includes('tablet') && !u.includes('mobile'))) device = 'Tablet'
  else if (u.includes('mobile') || u.includes('iphone') || u.includes('android')) device = 'Móvil'

  return { browser, os, device }
}

/** Extrae el contexto de acceso (IP + UA parseado + geolocalización CF) de la petición. */
export function getAccessContext(req: Request): AccessContext {
  const h = req.headers
  const ua = h.get('user-agent') || undefined
  const { browser, os, device } = parseUserAgent(ua)
  const country = h.get('cf-ipcountry') || undefined
  const city = h.get('cf-ipcity') || undefined
  const region = h.get('cf-region') || h.get('cf-region-code') || undefined
  return {
    ip: getRequestIp(req),
    userAgent: ua,
    browser, os, device,
    city, region,
    country: country && country !== 'XX' ? country : undefined,
  }
}

/** Enriquecimiento de ciudad/país por IP (fire-and-forget, nunca bloquea). */
async function enrichGeo(sessionId: string, ip?: string): Promise<void> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 3500)
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) return
    const d = await r.json()
    if (d?.status !== 'success') return
    await db.accessSession.update({
      where: { id: sessionId },
      data: {
        city: d.city || undefined,
        region: d.regionName || undefined,
        country: d.country || undefined,
      },
    }).catch(() => {})
  } catch { /* geolocalización best-effort */ }
}

/**
 * Registra un acceso exitoso como sesión activa.
 * Devuelve el AccessContext para reutilizarlo en la bitácora de auditoría.
 */
export async function recordAccessSession(opts: { workspaceId: string; userId: string; req: Request }): Promise<AccessContext> {
  const ctx = getAccessContext(opts.req)
  try {
    const session = await db.accessSession.create({
      data: {
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        browser: ctx.browser,
        os: ctx.os,
        device: ctx.device,
        city: ctx.city,
        region: ctx.region,
        country: ctx.country,
      },
    })
    // Enriquecer ciudad/país en segundo plano si CF no lo dio
    if (!ctx.city) void enrichGeo(session.id, ctx.ip)
  } catch { /* nunca bloquear el login */ }
  return ctx
}

/** Marca como revocadas las sesiones activas de un usuario (logout / revocación). */
export async function revokeUserSessions(userId: string, workspaceId?: string): Promise<void> {
  try {
    await db.accessSession.updateMany({
      where: { userId, isActive: true, ...(workspaceId ? { workspaceId } : {}) },
      data: { isActive: false, revokedAt: new Date() },
    })
  } catch { /* */ }
}
