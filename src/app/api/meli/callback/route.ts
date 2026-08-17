// ═══════════════════════════════════════════════════════════════
// GET /api/meli/callback?code=&state=  — callback OAuth de Mercado Libre.
// state = workspaceId. Intercambia el code por tokens y vuelve al panel.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace } from '@/lib/api-auth'
import { exchangeCode, type MeliConn } from '@/lib/meli/client'
import { logMeli } from '@/lib/meli/log'

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // workspaceId
  const err = searchParams.get('error')
  const back = (q: string) => NextResponse.redirect(`${appBaseUrl()}/?redirect=/meli&meli=${q}`)

  if (err || !code || !state) return back(err ? `error:${encodeURIComponent(err)}` : 'error')

  try {
    const session = await requireAuth(req)
    await requireWorkspace(state, session.userId)
    const conn = await db.meliConnection.findUnique({ where: { workspaceId: state } })
    if (!conn) return back('error:sin-config')
    await exchangeCode(conn as unknown as MeliConn, code)
    await logMeli(state, 'connect', { targetType: 'connection', status: 'ok', message: 'Cuenta de Mercado Libre conectada' })
    return back('connected')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    try { await db.meliConnection.updateMany({ where: { workspaceId: state }, data: { status: 'error', lastError: msg } }) } catch { /* ignore */ }
    await logMeli(state, 'connect', { targetType: 'connection', status: 'error', message: msg })
    return back(`error:${encodeURIComponent(msg).slice(0, 120)}`)
  }
}
