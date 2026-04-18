// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Edge-Compatible JWT Module
// Used by middleware (runs in Edge Runtime — NO Node.js APIs)
// Pure Web Crypto API — ZERO external dependencies
// Replaces jose package to eliminate Turbopack bundling issues
// ═══════════════════════════════════════════════════════════════

// JWT secret from env
const JWT_SECRET = process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-secret-do-not-use-in-prod-32chars!!' : (() => { throw new Error('NEXTAUTH_SECRET environment variable is required in production') })())

// Cookie name
export const SESSION_COOKIE_NAME = 'valiflow-session'

// JWT expiration: 30 days in seconds
const JWT_EXPIRATION_SECONDS = 30 * 24 * 60 * 60

// ─── Web Crypto Helpers ───────────────────────────────────────

/**
 * Base64URL encode a Uint8Array (RFC 7515 compliant).
 */
function base64urlEncode(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Base64URL decode a string to Uint8Array.
 */
function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Get the HMAC-SHA256 signing key from the JWT secret.
 * Uses crypto.subtle which is available in Edge Runtime and Node.js 15+.
 */
async function getSigningKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(JWT_SECRET)
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

// ─── JWT Token Operations ─────────────────────────────────────

export interface SessionPayload {
  userId: string
  email: string
  name: string
  role: string
  workspaceId?: string
}

/**
 * Create a JWT session token for an authenticated user.
 *
 * JWT structure: base64url(header).base64url(payload).base64url(signature)
 *
 * Compatible with standard JWT libraries — produces valid HS256 tokens.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const encoder = new TextEncoder()

  // Header: {"alg":"HS256","typ":"JWT"}
  const header: Record<string, string> = { alg: 'HS256', typ: 'JWT' }
  const headerBytes = encoder.encode(JSON.stringify(header))
  const headerB64 = base64urlEncode(headerBytes)

  // Payload: session data + timestamps
  const now = Math.floor(Date.now() / 1000)
  const jwtPayload: Record<string, unknown> = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRATION_SECONDS,
  }
  const payloadBytes = encoder.encode(JSON.stringify(jwtPayload))
  const payloadB64 = base64urlEncode(payloadBytes)

  // Signature: HMAC-SHA256(headerB64.payloadB64)
  const signingInput = `${headerB64}.${payloadB64}`
  const signingInputBytes = encoder.encode(signingInput)

  const key = await getSigningKey()
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, signingInputBytes)
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer))

  return `${signingInput}.${signatureB64}`
}

/**
 * Verify a JWT session token. Returns the payload if valid, null otherwise.
 *
 * Checks:
 * - Signature integrity (HMAC-SHA256)
 * - Expiration time (exp claim)
 * - Required fields presence
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    // Split token into parts
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [headerB64, payloadB64, signatureB64] = parts

    // Verify signature
    const encoder = new TextEncoder()
    const signingInput = `${headerB64}.${payloadB64}`
    const signingInputBytes = encoder.encode(signingInput)
    const signatureBytes = base64urlDecode(signatureB64)

    const key = await getSigningKey()
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      new Uint8Array(signatureBytes.buffer as ArrayBuffer),
      signingInputBytes
    )

    if (!valid) {
      return null
    }

    // Decode payload
    const payloadBytes = base64urlDecode(payloadB64)
    const payloadText = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadText) as Record<string, unknown>

    // Check expiration
    const exp = payload.exp as number | undefined
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    // Validate required fields
    if (!payload.userId || !payload.email || !payload.name || !payload.role) {
      return null
    }

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      workspaceId: payload.workspaceId as string | undefined,
    }
  } catch {
    return null
  }
}
