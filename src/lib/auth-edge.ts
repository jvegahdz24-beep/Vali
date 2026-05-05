// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Edge-Compatible JWT Module (Legacy Compatibility)
// Used by middleware (runs in Edge Runtime — NO Node.js APIs)
// Pure Web Crypto API — ZERO external dependencies
// ═══════════════════════════════════════════════════════════════
//
// NOTE: For full refresh-token auth in API routes, use:
//   import { verifyAccessToken, createTokenPair } from '@/lib/auth'
//
// This module is kept for edge middleware compatibility only.

// JWT secret from env — validated lazily at usage time
const _JWT_SECRET = process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-secret-do-not-use-in-prod-32chars!!' : '')

function getJWT_SECRET(): string {
  if (!_JWT_SECRET) {
    throw new Error('NEXTAUTH_SECRET environment variable is required in production')
  }
  return _JWT_SECRET
}

// Cookie name (shared with new auth module)
export const SESSION_COOKIE_NAME = 'valiflow-session'

// JWT expiration: 30 days in seconds (legacy, middleware-only)
const JWT_EXPIRATION_SECONDS = 30 * 24 * 60 * 60

// ─── Web Crypto Helpers ───────────────────────────────────────

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

async function getSigningKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(getJWT_SECRET())
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
 * LEGACY: Used by edge middleware. For API routes, use @/lib/auth instead.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const encoder = new TextEncoder()

  const header: Record<string, string> = { alg: 'HS256', typ: 'JWT' }
  const headerBytes = encoder.encode(JSON.stringify(header))
  const headerB64 = base64urlEncode(headerBytes)

  const now = Math.floor(Date.now() / 1000)
  const jwtPayload: Record<string, unknown> = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRATION_SECONDS,
  }
  const payloadBytes = encoder.encode(JSON.stringify(jwtPayload))
  const payloadB64 = base64urlEncode(payloadBytes)

  const signingInput = `${headerB64}.${payloadB64}`
  const signingInputBytes = encoder.encode(signingInput)

  const key = await getSigningKey()
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, signingInputBytes)
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer))

  return `${signingInput}.${signatureB64}`
}

/**
 * Verify a JWT session token. Returns the payload if valid, null otherwise.
 * LEGACY: Used by edge middleware. For API routes, use @/lib/auth instead.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [headerB64, payloadB64, signatureB64] = parts

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

    const payloadBytes = base64urlDecode(payloadB64)
    const payloadText = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadText) as Record<string, unknown>

    const exp = payload.exp as number | undefined
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      return null
    }

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
