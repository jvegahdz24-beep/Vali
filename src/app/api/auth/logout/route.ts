// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Logout API Endpoint
// POST /api/auth/logout — Limpia la cookie de sesión, responde JSON (lo usa el
//   panel principal vía fetch en use-auth.tsx).
// GET  /api/auth/logout — Igual, pero REDIRIGE a /login (para enlaces directos,
//   como el botón "Cerrar sesión" del panel admin y accept-invite). Antes daba
//   HTTP 405 porque solo existía POST (reporte de Jhon 2026-07-22).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth'
import { verifySessionToken } from '@/lib/auth-edge'
import { revokeUserSessions } from '@/lib/access-session'

async function clearSession(req: NextRequest, response: NextResponse): Promise<NextResponse> {
  // ValiGuard: revocar las sesiones activas del usuario que cierra sesión
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
    if (token) {
      const payload = await verifySessionToken(token)
      if (payload?.userId) await revokeUserSessions(payload.userId, payload.workspaceId)
    }
  } catch { /* no bloquear el logout */ }

  // Clear the session cookie
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // SEC-003
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return response
}

export async function POST(req: NextRequest) {
  return clearSession(req, NextResponse.json({ success: true }))
}

export async function GET(req: NextRequest) {
  // Navegación directa (link): limpia la sesión y manda al login.
  // OJO: usar Location RELATIVA ('/login'), NO new URL('/login', req.url):
  // detrás del proxy (Cloudflare→localhost:3105) req.url es el host INTERNO,
  // y el redirect terminaba en http://localhost:3105/login → ERR_CONNECTION_REFUSED
  // en el navegador del usuario (reporte de Jhon 2026-07-30). Una Location
  // relativa la resuelve el navegador sobre el dominio real (valiautoflow.com).
  const res = new NextResponse(null, { status: 302, headers: { Location: '/login' } })
  return clearSession(req, res)
}
