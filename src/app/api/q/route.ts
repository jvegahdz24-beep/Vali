// ═══════════════════════════════════════════════════════════════
// GET /api/q?d=<payload>&s=<sig>
// Tracked quote/payment-link redirect. On open, bumps the lead score
// +10 ONCE (spec Paso 3: "Lead abre un link de cotización +10"), then
// 302-redirects to the real target URL.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyTrackedLink } from '@/lib/tracking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK = (
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://valiautoflow.com'
).replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const d = req.nextUrl.searchParams.get('d')
  const s = req.nextUrl.searchParams.get('s')
  const payload = verifyTrackedLink(d, s)

  if (!payload) {
    return NextResponse.redirect(FALLBACK, { status: 302 })
  }

  // Bump score +10 once per 24h (dedup via EngineEvent).
  try {
    const contact = await db.contact.findUnique({
      where: { id: payload.c },
      select: { id: true, workspaceId: true, leadScore: true },
    })
    if (contact) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const already = await db.engineEvent.findFirst({
        where: {
          workspaceId: contact.workspaceId,
          contactId: contact.id,
          type: 'QUOTE_LINK_OPENED',
          createdAt: { gte: since },
        },
        select: { id: true },
      })
      if (!already) {
        const newScore = Math.min(100, (contact.leadScore ?? 0) + 10)
        const temperature = newScore >= 70 ? 'hot' : newScore >= 30 ? 'warm' : 'cold'
        await db.contact.update({
          where: { id: contact.id },
          data: { leadScore: newScore, temperature },
        })
        await db.engineEvent.create({
          data: {
            workspaceId: contact.workspaceId,
            contactId: contact.id,
            type: 'QUOTE_LINK_OPENED',
            score: newScore,
            temperature,
            metadata: JSON.stringify({ delta: 10, target: payload.u.slice(0, 300) }),
          },
        })
        console.log(`[Track:q] Quote link opened by ${contact.id} → +10 (score ${newScore})`)
      }
    }
  } catch (err) {
    console.warn('[Track:q] score bump error (non-critical):', (err as Error).message)
  }

  return NextResponse.redirect(payload.u, { status: 302 })
}
