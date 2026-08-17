import { describe, it, expect } from 'vitest'
import { buildTrackedQuoteLink, verifyTrackedLink } from '@/lib/tracking'

describe('tracking — signed quote/payment links (spec Paso 3)', () => {
  it('round-trips contactId + target URL through a signed link', () => {
    const url = buildTrackedQuoteLink('contact-123', 'https://pay.stripe.com/abc')
    expect(url).toContain('/api/q?d=')
    expect(url).toContain('&s=')
    const u = new URL(url)
    const payload = verifyTrackedLink(u.searchParams.get('d'), u.searchParams.get('s'))
    expect(payload?.c).toBe('contact-123')
    expect(payload?.u).toBe('https://pay.stripe.com/abc')
  })

  it('rejects a tampered signature', () => {
    const url = buildTrackedQuoteLink('c1', 'https://example.com')
    const u = new URL(url)
    expect(verifyTrackedLink(u.searchParams.get('d'), 'forged-signature')).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const url = buildTrackedQuoteLink('c1', 'https://example.com')
    const u = new URL(url)
    const goodSig = u.searchParams.get('s')
    const forgedData = Buffer.from(JSON.stringify({ c: 'evil', u: 'https://evil.com' })).toString('base64url')
    expect(verifyTrackedLink(forgedData, goodSig)).toBeNull()
  })

  it('returns the original URL unchanged for invalid input', () => {
    expect(buildTrackedQuoteLink('', 'https://x.com')).toBe('https://x.com')
    expect(buildTrackedQuoteLink('c1', 'not-a-url')).toBe('not-a-url')
  })
})
