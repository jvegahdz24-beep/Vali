// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta (Facebook/Instagram) Ads Webhook Tests
// Regression test suite for Meta Lead Ads webhook integration
//
// Tests:
//   1. HMAC-SHA256 signature verification
//   2. Lead Ads payload parsing (field_data format)
//   3. Messaging payload parsing (text format)
//   4. Malformed payload rejection
//   5. GET verification token validation
//   6. Rate limiting
// ═══════════════════════════════════════════════════════════════

jest.setTimeout(30000)

// ─── Mocks for external dependencies ──────────────────────────
// message-processor and db are imported at module level in the
// route handler — must mock BEFORE importing the route.

jest.mock('@/lib/db', () => ({
  db: {
    workspace: {
      findFirst: jest.fn(),
    },
    workspace: {
      findFirst: jest.fn(),
    },
    contact: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
    analyticsEvent: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/ai/message-processor', () => ({
  processMessageCore: jest.fn(),
}))

// ─── Source imports ───────────────────────────────────────────

import crypto from 'crypto'
import {
  parseMetaLeadEntry,
  verifyMetaSignature,
  extractFieldData,
  type ParsedLead,
} from '@/lib/meta/lead-parser'
import { normalizePhone } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════
// 1. HMAC-SHA256 Signature Verification
// ═══════════════════════════════════════════════════════════════
// Meta sends X-Hub-Signature-256: sha256=<hex_digest>
// where digest = HMAC-SHA256(body, APP_SECRET)

describe('1. Meta Signature Verification — verifyMetaSignature()', () => {

  it('valid signature returns true', () => {
    const secret = 'my-app-secret-123'
    const body = JSON.stringify({ object: 'page', entry: [] })
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body, 'utf8')
    const signature = `sha256=${hmac.digest('hex')}`

    expect(verifyMetaSignature(body, signature, secret)).toBe(true)
  })

  it('invalid signature returns false', () => {
    const secret = 'my-app-secret-123'
    const body = JSON.stringify({ object: 'page', entry: [] })
    const wrongSignature = 'sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

    expect(verifyMetaSignature(body, wrongSignature, secret)).toBe(false)
  })

  it('wrong secret returns false', () => {
    const correctSecret = 'my-app-secret-123'
    const wrongSecret = 'wrong-secret'
    const body = JSON.stringify({ object: 'page', entry: [] })
    const hmac = crypto.createHmac('sha256', wrongSecret)
    hmac.update(body, 'utf8')
    const signature = `sha256=${hmac.digest('hex')}`

    expect(verifyMetaSignature(body, signature, correctSecret)).toBe(false)
  })

  it('tampered body returns false', () => {
    const secret = 'my-app-secret-123'
    const originalBody = JSON.stringify({ object: 'page', entry: [] })
    const tamperedBody = JSON.stringify({ object: 'page', entry: [{ id: 'evil' }] })
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(originalBody, 'utf8')
    const signature = `sha256=${hmac.digest('hex')}`

    expect(verifyMetaSignature(tamperedBody, signature, secret)).toBe(false)
  })

  it('missing "sha256=" prefix returns false', () => {
    const secret = 'my-app-secret-123'
    const body = 'test-body'
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body, 'utf8')
    const signature = hmac.digest('hex') // No prefix

    expect(verifyMetaSignature(body, signature, secret)).toBe(false)
  })

  it('empty body returns false', () => {
    expect(verifyMetaSignature('', 'sha256=something', 'secret')).toBe(false)
  })

  it('empty signature returns false', () => {
    expect(verifyMetaSignature('body', '', 'secret')).toBe(false)
  })

  it('empty secret returns false', () => {
    expect(verifyMetaSignature('body', 'sha256=something', '')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Lead Ads Payload Parsing (field_data format)
// ═══════════════════════════════════════════════════════════════

describe('2. Lead Ads Parsing — parseMetaLeadEntry()', () => {

  it('extracts name, phone, email from standard field_data', () => {
    const entry = {
      id: 'PAGE_ID_123',
      time: 1234567890,
      changes: [{
        field: 'leadgen',
        value: {
          leadgen_id: 'LEAD_001',
          ad_id: 'AD_001',
          form_id: 'FORM_001',
          created_time: 1234567890,
          page_id: 'PAGE_ID_123',
          field_data: [
            { name: 'full_name', values: ['Jonathan Vega'] },
            { name: 'phone_number', values: ['+525512345678'] },
            { name: 'email', values: ['jonathan@example.com'] },
          ],
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)

    expect(lead).not.toBeNull()
    expect(lead!.name).toBe('Jonathan Vega')
    expect(lead!.phone).toBe('+525512345678')
    expect(lead!.email).toBe('jonathan@example.com')
    expect(lead!.leadgenId).toBe('LEAD_001')
    expect(lead!.adId).toBe('AD_001')
    expect(lead!.formId).toBe('FORM_001')
    expect(lead!.pageId).toBe('PAGE_ID_123')
    expect(lead!.timestamp).toBe(1234567890)
  })

  it('builds messageText from all field_data', () => {
    const entry = {
      changes: [{
        field: 'leadgen',
        value: {
          leadgen_id: 'LEAD_002',
          field_data: [
            { name: 'full_name', values: ['Maria Garcia'] },
            { name: 'city', values: ['CDMX'] },
          ],
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)

    expect(lead).not.toBeNull()
    expect(lead!.messageText).toContain('full_name: Maria Garcia')
    expect(lead!.messageText).toContain('city: CDMX')
  })

  it('handles partial field_data (name only, no phone)', () => {
    const entry = {
      changes: [{
        field: 'leadgen',
        value: {
          leadgen_id: 'LEAD_003',
          field_data: [
            { name: 'full_name', values: ['Carlos Lopez'] },
            { name: 'email', values: ['carlos@test.com'] },
          ],
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)

    expect(lead).not.toBeNull()
    expect(lead!.name).toBe('Carlos Lopez')
    expect(lead!.phone).toBeNull()
    expect(lead!.email).toBe('carlos@test.com')
  })

  it('uses alternative field names (first_name, phone, email_address)', () => {
    const entry = {
      changes: [{
        field: 'leadgen',
        value: {
          leadgen_id: 'LEAD_004',
          field_data: [
            { name: 'first_name', values: ['Ana'] },
            { name: 'phone', values: ['+15551234567'] },
            { name: 'email_address', values: ['ana@us.com'] },
          ],
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)

    expect(lead).not.toBeNull()
    expect(lead!.name).toBe('Ana')
    expect(lead!.phone).toBe('+15551234567')
    expect(lead!.email).toBe('ana@us.com')
  })

  it('handles empty field_data array', () => {
    const entry = {
      changes: [{
        field: 'leadgen',
        value: {
          leadgen_id: 'LEAD_005',
          field_data: [],
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)

    expect(lead).not.toBeNull()
    expect(lead!.name).toBeNull()
    expect(lead!.phone).toBeNull()
    expect(lead!.email).toBeNull()
    expect(lead!.messageText).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Messaging Payload Parsing (text format)
// ═══════════════════════════════════════════════════════════════

describe('3. Messaging Parsing — parseMetaLeadEntry()', () => {

  it('extracts text from messaging format', () => {
    const entry = {
      id: 'PAGE_ID_456',
      time: 1234567890,
      messaging: [{
        sender: { id: 'FB_USER_001' },
        recipient: { id: 'PAGE_ID_456' },
        timestamp: 1234567890,
        message: {
          mid: 'mid.abc123',
          text: 'Hola, me interesa su servicio',
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)

    expect(lead).not.toBeNull()
    expect(lead!.messageText).toBe('Hola, me interesa su servicio')
    expect(lead!.fbUserId).toBe('FB_USER_001')
    expect(lead!.pageId).toBe('PAGE_ID_456')
    expect(lead!.leadgenId).toBeNull()
    expect(lead!.phone).toBeNull()
    expect(lead!.email).toBeNull()
  })

  it('returns null for messaging without text (image message)', () => {
    const entry = {
      id: 'PAGE_ID_456',
      messaging: [{
        sender: { id: 'FB_USER_002' },
        message: {
          mid: 'mid.img123',
          attachments: [{ type: 'image' }],
        },
      }],
    }

    const lead = parseMetaLeadEntry(entry)
    expect(lead).toBeNull()
  })

  it('returns null for empty messaging array', () => {
    const entry = {
      id: 'PAGE_ID_456',
      messaging: [],
    }

    const lead = parseMetaLeadEntry(entry)
    expect(lead).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Malformed Payload Rejection
// ═══════════════════════════════════════════════════════════════

describe('4. Malformed Payloads — parseMetaLeadEntry()', () => {

  it('returns null for null entry', () => {
    expect(parseMetaLeadEntry(null as any)).toBeNull()
  })

  it('returns null for undefined entry', () => {
    expect(parseMetaLeadEntry(undefined as any)).toBeNull()
  })

  it('returns null for empty object', () => {
    expect(parseMetaLeadEntry({} as any)).toBeNull()
  })

  it('returns null for entry with empty changes', () => {
    expect(parseMetaLeadEntry({ changes: [] } as any)).toBeNull()
  })

  it('returns null for changes with non-leadgen field', () => {
    const entry = {
      changes: [{
        field: 'feed',
        value: { post_id: '123' },
      }],
    }

    expect(parseMetaLeadEntry(entry as any)).toBeNull()
  })

  it('returns null for entry with changes but no value', () => {
    const entry = {
      changes: [{ field: 'leadgen' }],
    }

    expect(parseMetaLeadEntry(entry as any)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. extractFieldData Helper
// ═══════════════════════════════════════════════════════════════

describe('5. extractFieldData() Helper', () => {

  const fields = [
    { name: 'full_name', values: ['Jonathan Vega'] },
    { name: 'phone_number', values: ['+525512345678'] },
    { name: 'email', values: ['jonathan@example.com'] },
  ]

  it('returns value for existing field', () => {
    expect(extractFieldData(fields, 'full_name')).toBe('Jonathan Vega')
    expect(extractFieldData(fields, 'phone_number')).toBe('+525512345678')
    expect(extractFieldData(fields, 'email')).toBe('jonathan@example.com')
  })

  it('returns null for non-existing field', () => {
    expect(extractFieldData(fields, 'nonexistent')).toBeNull()
    expect(extractFieldData(fields, 'address')).toBeNull()
  })

  it('returns null for empty fields array', () => {
    expect(extractFieldData([], 'full_name')).toBeNull()
  })

  it('returns null for null/undefined fields', () => {
    expect(extractFieldData(null as any, 'full_name')).toBeNull()
    expect(extractFieldData(undefined as any, 'full_name')).toBeNull()
  })

  it('returns first value when multiple values exist', () => {
    const multiFields = [
      { name: 'interests', values: ['cars', 'trucks', 'motorcycles'] },
    ]
    expect(extractFieldData(multiFields, 'interests')).toBe('cars')
  })

  it('returns null when values array is empty', () => {
    const emptyValues = [
      { name: 'notes', values: [] },
    ]
    expect(extractFieldData(emptyValues, 'notes')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. GET Verification Token Validation
// ═══════════════════════════════════════════════════════════════
// The GET handler checks hub.mode === 'subscribe' and hub.verify_token
// matches META_VERIFY_TOKEN. These tests verify the logic that would
// run inside the route handler by testing the condition directly.

describe('6. GET Verification — Token Validation Logic', () => {

  /** Simulates the verification logic from the GET handler */
  function simulateVerification(mode: string, token: string, expectedToken: string): string | null {
    if (mode === 'subscribe' && token === expectedToken) {
      return 'valid' // Would return hub.challenge
    }
    return null // Would return 403
  }

  it('accepts correct mode and token', () => {
    expect(simulateVerification('subscribe', 'my-verify-token', 'my-verify-token')).toBe('valid')
  })

  it('rejects wrong verify token', () => {
    expect(simulateVerification('subscribe', 'wrong-token', 'my-verify-token')).toBeNull()
  })

  it('rejects wrong mode (not subscribe)', () => {
    expect(simulateVerification('denied', 'my-verify-token', 'my-verify-token')).toBeNull()
  })

  it('rejects empty token', () => {
    expect(simulateVerification('subscribe', '', 'my-verify-token')).toBeNull()
  })

  it('rejects empty mode', () => {
    expect(simulateVerification('', 'my-verify-token', 'my-verify-token')).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. Rate Limiting
// ═══════════════════════════════════════════════════════════════
// Tests the rate limiting algorithm used in the webhook route.
// The real rate limiter is in-module; we simulate the same logic.

describe('7. Rate Limiting — 100 req/min per IP', () => {

  /**
   * Simulates the rate limiting logic from the route handler.
   * Uses the same algorithm: sliding window with per-IP counter.
   */
  function createRateLimiter(limit: number = 100, windowMs: number = 60_000) {
    const store = new Map<string, { count: number; resetAt: number }>()

    return {
      check(ip: string): boolean {
        const now = Date.now()
        const entry = store.get(ip)

        if (!entry || now >= entry.resetAt) {
          store.set(ip, { count: 1, resetAt: now + windowMs })
          return true
        }

        if (entry.count >= limit) {
          return false
        }

        entry.count++
        return true
      },
      reset(): void {
        store.clear()
      },
    }
  }

  it('allows requests under the limit', () => {
    const limiter = createRateLimiter(5, 60_000)

    for (let i = 0; i < 5; i++) {
      expect(limiter.check('1.2.3.4')).toBe(true)
    }
  })

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter(3, 60_000)

    expect(limiter.check('1.2.3.4')).toBe(true)  // 1
    expect(limiter.check('1.2.3.4')).toBe(true)  // 2
    expect(limiter.check('1.2.3.4')).toBe(true)  // 3 (at limit)
    expect(limiter.check('1.2.3.4')).toBe(false) // 4 (blocked)
    expect(limiter.check('1.2.3.4')).toBe(false) // 5 (still blocked)
  })

  it('different IPs have independent limits', () => {
    const limiter = createRateLimiter(2, 60_000)

    expect(limiter.check('1.1.1.1')).toBe(true)
    expect(limiter.check('1.1.1.1')).toBe(true)
    expect(limiter.check('1.1.1.1')).toBe(false) // blocked

    expect(limiter.check('2.2.2.2')).toBe(true)  // independent
    expect(limiter.check('2.2.2.2')).toBe(true)
    expect(limiter.check('2.2.2.2')).toBe(false) // blocked
  })

  it('resets after window expires', () => {
    // Use a 50ms window for fast test
    const limiter = createRateLimiter(2, 50)

    expect(limiter.check('1.2.3.4')).toBe(true)
    expect(limiter.check('1.2.3.4')).toBe(true)
    expect(limiter.check('1.2.3.4')).toBe(false)

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(limiter.check('1.2.3.4')).toBe(true) // window reset
        resolve()
      }, 60)
    })
  })

  it('allows full 100 requests per minute', () => {
    const limiter = createRateLimiter(100, 60_000)

    for (let i = 0; i < 100; i++) {
      expect(limiter.check('5.5.5.5')).toBe(true)
    }
    expect(limiter.check('5.5.5.5')).toBe(false) // 101st blocked
  })
})

// ═══════════════════════════════════════════════════════════════
// 8. Phone Normalization Integration
// ═══════════════════════════════════════════════════════════════
// Verify that phone numbers from Meta leads normalize correctly
// through the existing normalizePhone utility.

describe('8. Phone Normalization — Meta Lead Phones', () => {

  it('normalizes Mexican phone +5255... to 12-digit format', () => {
    const raw = '+525512345678'
    const normalized = normalizePhone(raw)
    // +525512345678 → strip + → 525512345678 (13 digits)
    // 521 prefix → strip to 52 → 525512345678 (12 digits)
    expect(normalized.length).toBe(12)
    expect(normalized).toBe('525512345678')
  })

  it('handles US phone number', () => {
    const raw = '+15551234567'
    const normalized = normalizePhone(raw)
    // US number: 11 digits after + → stays as is (not Mexican prefix)
    expect(normalized).toBe('15551234567')
  })

  it('handles null/undefined phone', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════
// 9. End-to-End Lead Ads Flow (parsing + normalization)
// ═══════════════════════════════════════════════════════════════

describe('9. E2E: Full Lead Ads Pipeline', () => {

  it('parses a realistic Mexican Lead Ads payload end-to-end', () => {
    const payload = {
      object: 'page',
      entry: [{
        id: 'PAGE_MX_001',
        time: 1700000000,
        changes: [{
          field: 'leadgen',
          value: {
            leadgen_id: 'LD_MX_001',
            ad_id: 'AD_MX_001',
            form_id: 'FORM_MX_001',
            created_time: 1700000000,
            page_id: 'PAGE_MX_001',
            field_data: [
              { name: 'full_name', values: ['Jonathan Vega'] },
              { name: 'phone_number', values: ['+52 55 1234 5678'] },
              { name: 'email', values: ['jonathan@example.com'] },
              { name: 'ciudad', values: ['Ciudad de México'] },
              { name: 'servicio', values: ['Publicidad Digital'] },
            ],
          },
        }],
      }],
    }

    const entry = payload.entry[0]
    const lead = parseMetaLeadEntry(entry)

    // Parsing assertions
    expect(lead).not.toBeNull()
    expect(lead!.name).toBe('Jonathan Vega')
    expect(lead!.phone).toBe('+52 55 1234 5678')
    expect(lead!.email).toBe('jonathan@example.com')
    expect(lead!.leadgenId).toBe('LD_MX_001')

    // Normalization
    const normalizedPhone = normalizePhone(lead!.phone!)
    expect(normalizedPhone.length).toBeGreaterThanOrEqual(10)

    // Message text contains all field data
    expect(lead!.messageText).toContain('Jonathan Vega')
    expect(lead!.messageText).toContain('jonathan@example.com')
    expect(lead!.messageText).toContain('Ciudad de México')
    expect(lead!.messageText).toContain('Publicidad Digital')

    // Contact creation data
    const nameParts = (lead!.name || '').split(' ')
    expect(nameParts[0]).toBe('Jonathan')
    expect(nameParts.slice(1).join(' ')).toBe('Vega')
  })
})
