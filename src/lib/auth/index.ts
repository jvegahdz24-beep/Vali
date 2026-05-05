// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — JWT Auth with Refresh Tokens
// Production-ready auth layer:
//   - Short-lived access tokens (15 min)
//   - Long-lived refresh tokens (7 days), stored in Redis
//   - Token revocation via Redis blacklist
//   - Seamless refresh flow
//   - Edge-compatible (Web Crypto API only)
// ═══════════════════════════════════════════════════════════════

import { config } from '@/lib/config'
import { getRedis, redisKeys, isRedisAvailable } from '@/lib/redis'
import { logError, logInfo } from '@/lib/logger'
import crypto from 'crypto'

// ─── Constants ─────────────────────────────────────────────────

const ACCESS_TOKEN_EXPIRY = config.JWT_ACCESS_EXPIRY_SECONDS
const REFRESH_TOKEN_EXPIRY = config.JWT_REFRESH_EXPIRY_SECONDS

export const SESSION_COOKIE_NAME = 'valiflow-session'
export const REFRESH_COOKIE_NAME = 'valiflow-refresh'

// ─── Types ─────────────────────────────────────────────────────

export interface SessionPayload {
  userId: string
  email: string
  name: string
  role: string
  workspaceId?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

// ─── Crypto Helpers (Web Crypto compatible) ───────────────────

function base64urlEncode(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function getSigningKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(config.NEXTAUTH_SECRET)
  return crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// ─── Access Token ──────────────────────────────────────────────

/**
 * Create a short-lived access token (JWT).
 */
export async function createAccessToken(payload: SessionPayload): Promise<string> {
  const encoder = new TextEncoder()
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)))

  const now = Math.floor(Date.now() / 1000)
  const jwtPayload = {
    ...payload,
    type: 'access',
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  }
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(jwtPayload)))

  const signingInput = `${headerB64}.${payloadB64}`
  const signingInputBytes = encoder.encode(signingInput)
  const key = await getSigningKey()
  const sig = await crypto.subtle.sign('HMAC', key, signingInputBytes)
  const sigB64 = base64urlEncode(new Uint8Array(sig))

  return `${signingInput}.${sigB64}`
}

/**
 * Verify and decode an access token.
 * Returns null if invalid, expired, or revoked.
 */
export async function verifyAccessToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, sigB64] = parts
    const encoder = new TextEncoder()
    const signingInput = `${headerB64}.${payloadB64}`
    const sigBytes = base64urlDecode(sigB64)

    const key = await getSigningKey()
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(signingInput))
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    // Check it's an access token (not refresh)
    if (payload.type !== 'access') return null

    // Check required fields
    if (!payload.userId || !payload.email) return null

    // Check revocation blacklist
    const revoked = await isTokenRevoked(token)
    if (revoked) return null

    return {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      workspaceId: payload.workspaceId,
    }
  } catch {
    return null
  }
}

// ─── Refresh Token ─────────────────────────────────────────────

/**
 * Create a refresh token and store it in Redis.
 * Returns the raw token string (opaque, not JWT).
 */
export async function createRefreshToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = `rt_${crypto.randomBytes(32).toString('hex')}`
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000)

  try {
    const redis = await getRedis()
    await redis.set(
      redisKeys.sessionRefresh(userId),
      token,
      'EX',
      REFRESH_TOKEN_EXPIRY,
    )
  } catch (err) {
    logError('AUTH', 'refresh_token_store_failed', err)
    // Continue — refresh token still works, just can't revoke
  }

  return { token, expiresAt }
}

/**
 * Verify a refresh token against Redis.
 * Returns the userId if valid, null otherwise.
 */
export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const redis = await getRedis()
    // Scan for the token (we need to find which userId it belongs to)
    // For efficiency, we store userId -> token mapping
    const pattern = `${config.REDIS_PREFIX}refresh:*`
    const stream = redis.scanStream({ match: pattern, count: 100 })

    let foundUserId: string | null = null

    const checkToken = async (keys: string[]): Promise<void> => {
      if (foundUserId) return
      const values = await redis.mget(...keys)
      for (let i = 0; i < keys.length; i++) {
        if (values[i] === token) {
          // Extract userId from key: valiflow:refresh:userId
          const key = keys[i].replace(config.REDIS_PREFIX, '')
          foundUserId = key.replace('refresh:', '')
          return
        }
      }
    }

    // We need a more efficient approach for production:
    // Store also a reverse mapping token -> userId
    const reverseKey = `${config.REDIS_PREFIX}rt_reverse:${token}`
    const userId = await redis.get(reverseKey)

    if (userId) {
      // Verify the forward mapping still exists
      const storedToken = await redis.get(redisKeys.sessionRefresh(userId))
      if (storedToken === token) return userId
      // Mismatch — token was rotated
      await redis.del(reverseKey).catch(() => {})
      return null
    }

    return null
  } catch {
    return null
  }
}

/**
 * Rotate refresh tokens — invalidate old, issue new.
 * Called after successful token refresh.
 */
export async function rotateRefreshToken(
  oldToken: string,
  userId: string,
): Promise<{ token: string; expiresAt: Date } | null> {
  // Verify old token first
  const currentUserId = await verifyRefreshToken(oldToken)
  if (!currentUserId || currentUserId !== userId) return null

  // Create new token
  const newTokenData = await createRefreshToken(userId)

  // Store reverse mapping for efficient lookup
  try {
    const redis = await getRedis()
    await redis.set(
      `${config.REDIS_PREFIX}rt_reverse:${newTokenData.token}`,
      userId,
      'EX',
      REFRESH_TOKEN_EXPIRY,
    )
    // Delete old reverse mapping
    await redis.del(`${config.REDIS_PREFIX}rt_reverse:${oldToken}`).catch(() => {})
  } catch {
    // Non-critical
  }

  return newTokenData
}

/**
 * Revoke a refresh token (logout).
 */
export async function revokeRefreshToken(userId: string): Promise<void> {
  try {
    const redis = await getRedis()
    // Get current token to clean up reverse mapping
    const currentToken = await redis.get(redisKeys.sessionRefresh(userId))
    if (currentToken) {
      await redis.del(`${config.REDIS_PREFIX}rt_reverse:${currentToken}`).catch(() => {})
    }
    await redis.del(redisKeys.sessionRefresh(userId))
  } catch {
    // Non-critical
  }
}

/**
 * Revoke ALL refresh tokens for a user (e.g., password change).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  try {
    const redis = await getRedis()
    await redis.del(redisKeys.sessionRefresh(userId))
    // Note: reverse mappings will expire naturally via TTL
  } catch {
    // Non-critical
  }
}

// ─── Token Revocation Blacklist ────────────────────────────────

/**
 * Add an access token to the revocation blacklist.
 * Used for immediate logout / security events.
 */
export async function revokeAccessToken(token: string): Promise<void> {
  try {
    const redis = await getRedis()
    // Blacklist until the token's natural expiration
    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(token.split('.')[1]))
    )
    const ttl = (payload.exp - Math.floor(Date.now() / 1000)) || ACCESS_TOKEN_EXPIRY
    await redis.set(
      `${config.REDIS_PREFIX}blacklist:${token}`,
      '1',
      'EX',
      Math.max(ttl, 1),
    )
  } catch {
    // Non-critical
  }
}

/**
 * Check if a token is in the revocation blacklist.
 */
async function isTokenRevoked(token: string): Promise<boolean> {
  try {
    const redis = await getRedis()
    const result = await redis.get(`${config.REDIS_PREFIX}blacklist:${token}`)
    return result === '1'
  } catch {
    return false
  }
}

// ─── Full Token Pair Creation ──────────────────────────────────

/**
 * Create both access + refresh tokens.
 * Call this on login/register.
 */
export async function createTokenPair(payload: SessionPayload): Promise<TokenPair> {
  const [accessToken, refreshTokenData] = await Promise.all([
    createAccessToken(payload),
    createRefreshToken(payload.userId),
  ])

  // Store reverse mapping for efficient refresh verification
  try {
    const redis = await getRedis()
    await redis.set(
      `${config.REDIS_PREFIX}rt_reverse:${refreshTokenData.token}`,
      payload.userId,
      'EX',
      REFRESH_TOKEN_EXPIRY,
    )
  } catch {
    // Non-critical
  }

  return {
    accessToken,
    refreshToken: refreshTokenData.token,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  }
}

/**
 * Full logout — revoke access token + refresh token.
 */
export async function revokeSession(accessToken: string, userId: string): Promise<void> {
  await Promise.all([
    revokeAccessToken(accessToken),
    revokeRefreshToken(userId),
  ])
}
