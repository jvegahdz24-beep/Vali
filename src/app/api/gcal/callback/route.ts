// GET /api/gcal/callback?code=&state= — callback OAuth de Google Calendar.
// Pública (Google redirige aquí). El state viene FIRMADO (workspaceId.userId.hmac):
// se verifica y el token se guarda como conexión PERSONAL de ese usuario.
import { NextRequest, NextResponse } from 'next/server'
import { gcalExchangeCode, gcalParseState } from '@/lib/gcal'

const base = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const err = req.nextUrl.searchParams.get('error')
  const back = (q: string) => NextResponse.redirect(`${base()}/?redirect=/calendar&gcal=${q}`)
  if (err || !code || !state) return back(err ? `error:${encodeURIComponent(err)}` : 'error')
  const parsed = gcalParseState(state)
  if (!parsed) return back('error:estado-invalido')
  try {
    await gcalExchangeCode(parsed.workspaceId, code, parsed.userId)
    return back('connected')
  } catch (e) {
    return back(`error:${encodeURIComponent((e instanceof Error ? e.message : 'error').slice(0, 100))}`)
  }
}
