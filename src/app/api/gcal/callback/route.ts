// Pública (Google redirige aquí). El state firmado y la cookie HttpOnly atan
// la conexión a un workspace, usuario y navegador durante el flujo OAuth.
import { NextRequest, NextResponse } from 'next/server'
import { gcalExchangeCode, gcalParseState, GCAL_STATE_COOKIE_NAME } from '@/lib/gcal'

const base = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const err = req.nextUrl.searchParams.get('error')
  const stateCookie = req.cookies.get(GCAL_STATE_COOKIE_NAME)?.value
  const back = (q: string) => {
    const response = NextResponse.redirect(`${base()}/?redirect=/calendar&gcal=${q}`)
    response.cookies.set(GCAL_STATE_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
    return response
  }
  if (err || !code || !state || !stateCookie || state !== stateCookie) {
    return back(err ? `error:${encodeURIComponent(err)}` : 'error')
  }
  const parsed = gcalParseState(state)
  if (!parsed) return back('error:estado-invalido')
  try {
    await gcalExchangeCode(parsed.workspaceId, code, parsed.userId)
    return back('connected')
  } catch (e) {
    return back(`error:${encodeURIComponent((e instanceof Error ? e.message : 'error').slice(0, 100))}`)
  }
}
