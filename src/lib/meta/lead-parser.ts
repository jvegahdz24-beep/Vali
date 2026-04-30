// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Meta (Facebook/Instagram) Lead Parser
// Utility module for parsing Meta webhook payloads
//
// Handles two payload formats:
//   1. Lead Ads (leadgen) — form submission data
//   2. Messaging — direct page messages (text only)
//
// Also provides HMAC-SHA256 signature verification for
// X-Hub-Signature-256 header validation.
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto'

// ─── Types ──────────────────────────────────────────────────────

/** Parsed lead data extracted from either payload format */
export interface ParsedLead {
  /** Lead's full name (from field_data or pushName) */
  name: string | null
  /** Lead's phone number (raw, before normalization) */
  phone: string | null
  /** Lead's email address */
  email: string | null
  /** Lead's message text (from messaging format or combined field_data) */
  messageText: string | null
  /** Meta leadgen ID (if from Lead Ads) */
  leadgenId: string | null
  /** Meta ad ID */
  adId: string | null
  /** Meta form ID */
  formId: string | null
  /** Meta page ID */
  pageId: string | null
  /** Facebook user ID (from messaging format) */
  fbUserId: string | null
  /** Timestamp from Meta */
  timestamp: number | null
  /** Raw field_data array from Lead Ads */
  fieldData: Array<{ name: string; values: string[] }>
}

/** Meta webhook entry item */
interface MetaEntry {
  id?: string
  time?: number
  messaging?: Array<{
    sender?: { id?: string }
    recipient?: { id?: string }
    timestamp?: number
    message?: {
      mid?: string
      text?: string
    }
  }>
  changes?: Array<{
    field?: string
    value?: {
      leadgen_id?: string
      ad_id?: string
      form_id?: string
      created_time?: number
      page_id?: string
      field_data?: Array<{ name: string; values: string[] }>
    }
  }>
}

// ═══════════════════════════════════════════════════════════════
// Field Extraction Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Extract a specific field value from Meta Lead Ads field_data array.
 *
 * Meta sends field_data as an array of { name, values[] } objects.
 * This helper finds the first matching field name and returns its
 * first value (or null if not found).
 *
 * @param fields - Array of { name, values } from field_data
 * @param fieldName - The field name to look for (e.g. "full_name", "phone_number")
 * @returns The first value string, or null if not found
 *
 * @example
 * extractFieldData(field_data, 'phone_number') // "+525512345678"
 * extractFieldData(field_data, 'nonexistent')  // null
 */
export function extractFieldData(
  fields: Array<{ name: string; values: string[] }>,
  fieldName: string,
): string | null {
  if (!fields || !Array.isArray(fields)) return null
  const match = fields.find((f) => f.name === fieldName)
  if (!match || !match.values || match.values.length === 0) return null
  return match.values[0] || null
}

// ═══════════════════════════════════════════════════════════════
// Lead Parsing
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a single Meta webhook entry into a normalized ParsedLead.
 *
 * Handles two formats:
 *   1. Lead Ads (leadgen) — entry.changes[].field === 'leadgen'
 *   2. Messaging — entry.messaging[].message.text
 *
 * Returns null if the entry contains neither format or is malformed.
 *
 * @param entry - A single entry object from Meta webhook payload
 * @returns ParsedLead or null if unparseable
 */
export function parseMetaLeadEntry(entry: MetaEntry): ParsedLead | null {
  if (!entry) return null

  // ── Format 1: Lead Ads (leadgen) ──
  if (entry.changes && entry.changes.length > 0) {
    const leadgenChange = entry.changes.find((c) => c.field === 'leadgen')
    if (leadgenChange?.value) {
      const val = leadgenChange.value
      const fields = val.field_data || []

      const name = extractFieldData(fields, 'full_name')
        || extractFieldData(fields, 'name')
        || extractFieldData(fields, 'first_name')

      const phone = extractFieldData(fields, 'phone_number')
        || extractFieldData(fields, 'phone')

      const email = extractFieldData(fields, 'email')
        || extractFieldData(fields, 'email_address')

      // Build a message text from all field data for context
      const fieldParts = fields
        .filter((f) => f.values && f.values.length > 0)
        .map((f) => `${f.name}: ${f.values.join(', ')}`)
      const messageText = fieldParts.length > 0 ? fieldParts.join('\n') : null

      return {
        name,
        phone,
        email,
        messageText,
        leadgenId: val.leadgen_id || null,
        adId: val.ad_id || null,
        formId: val.form_id || null,
        pageId: val.page_id || null,
        fbUserId: null,
        timestamp: val.created_time || entry.time || null,
        fieldData: fields,
      }
    }
  }

  // ── Format 2: Messaging (direct page message) ──
  if (entry.messaging && entry.messaging.length > 0) {
    const msg = entry.messaging[0]
    const text = msg?.message?.text

    // Skip non-text messages (images, attachments, etc.)
    if (!text) return null

    return {
      name: null, // Name not available in messaging format
      phone: null, // Phone not available in messaging format
      email: null,
      messageText: text,
      leadgenId: null,
      adId: null,
      formId: null,
      pageId: msg?.recipient?.id || entry.id || null,
      fbUserId: msg?.sender?.id || null,
      timestamp: msg?.timestamp || entry.time || null,
      fieldData: [],
    }
  }

  // ── Unknown / malformed format ──
  return null
}

// ═══════════════════════════════════════════════════════════════
// Signature Verification
// ═══════════════════════════════════════════════════════════════

/**
 * Verify the X-Hub-Signature-256 header from a Meta webhook request.
 *
 * Meta computes: HMAC-SHA256(request_body, APP_SECRET)
 * The header value is "sha1=<hex_digest>" (despite the name, Meta
 * uses SHA-256 for the _256 variant).
 *
 * This function performs timing-safe comparison to prevent
 * timing attacks.
 *
 * @param body - Raw request body as string (must NOT be parsed yet)
 * @param signature - The X-Hub-Signature-256 header value
 * @param secret - The META_APP_SECRET
 * @returns true if the signature is valid, false otherwise
 */
export function verifyMetaSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  if (!body || !signature || !secret) return false

  // Meta sends "sha256=<hex>" format
  const expectedPrefix = 'sha256='
  if (!signature.startsWith(expectedPrefix)) return false

  const providedDigest = signature.slice(expectedPrefix.length)
  if (!providedDigest) return false

  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body, 'utf8')
  const expectedDigest = hmac.digest('hex')

  // Timing-safe comparison to prevent timing attacks
  if (providedDigest.length !== expectedDigest.length) return false

  let result = 0
  for (let i = 0; i < expectedDigest.length; i++) {
    result |= expectedDigest.charCodeAt(i) ^ providedDigest.charCodeAt(i)
  }

  return result === 0
}
