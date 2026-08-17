// GET /api/tiktok/callback?code=&state=<workspaceId> — callback OAuth de TikTok.
// Pública (TikTok redirige aquí). Canjea el code y vuelve al panel.
import { NextRequest, NextResponse } from 'next/server'
import { tiktokExchangeCode } from '@/lib/marketing/tiktok'

const base = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') // workspaceId
  const err = req.nextUrl.searchParams.get('error')
  const back = (q: string) => NextResponse.redirect(`${base()}/?redirect=/marketing&tiktok=${q}`)
  if (err || !code || !state) return back(err ? `error:${encodeURIComponent(err)}` : 'error')
  try {
    await tiktokExchangeCode(state, code, `${base()}/api/tiktok/callback`)
    return back('connected')
  } catch (e) {
    return back(`error:${encodeURIComponent((e instanceof Error ? e.message : 'error').slice(0, 100))}`)
  }
}
