// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Tracked quote/payment links (spec Paso 3: "abre link +10")
//
// Wraps an outbound link in a signed redirect so we can detect when a
// lead OPENS it and bump the lead score +10 (once). No DB schema change:
// the contactId + target URL travel inside an HMAC-signed token, and the
// "+10 once" dedup is recorded as an EngineEvent.
// ═══════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'crypto'

function secret(): string {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.CRON_SECRET ||
    process.env.WORKER_KEY ||
    'valiautoflow-tracking-fallback'
  )
}

function appUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://valiautoflow.com'
  ).replace(/\/$/, '')
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export interface TrackedPayload {
  c: string // contactId
  u: string // target URL
}

/**
 * Build a tracked link that records the open (+10) before redirecting to
 * the real target. Returns the original URL unchanged if inputs are invalid.
 */
export function buildTrackedQuoteLink(contactId: string, targetUrl: string): string {
  if (!contactId || !targetUrl || !/^https?:\/\//i.test(targetUrl)) return targetUrl
  const data = b64url(JSON.stringify({ c: contactId, u: targetUrl } as TrackedPayload))
  const s = sign(data)
  return `${appUrl()}/api/q?d=${data}&s=${s}`
}

/** Verify a tracked link token; returns the payload or null if tampered. */
export function verifyTrackedLink(d: string | null, s: string | null): TrackedPayload | null {
  if (!d || !s) return null
  try {
    const expected = sign(d)
    const a = Buffer.from(s)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(d, 'base64url').toString('utf8')) as TrackedPayload
    if (!payload?.c || !payload?.u || !/^https?:\/\//i.test(payload.u)) return null
    return payload
  } catch {
    return null
  }
}
