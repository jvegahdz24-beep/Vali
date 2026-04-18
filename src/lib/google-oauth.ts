// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Google OAuth Helper Functions
// Handles Google OAuth consent URL generation, token exchange,
// and user profile fetching for the custom JWT auth system.
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto'

// ─── Configuration ──────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

// OAuth scopes requested from Google
const SCOPES = [
  'openid',
  'email',
  'profile',
].join(' ')

// State cookie name for CSRF protection
export const GOOGLE_STATE_COOKIE_NAME = 'google-oauth-state'

// ─── Helper: Get base URL from env ──────────────────────────

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

// ─── Types ──────────────────────────────────────────────────

export interface GoogleAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  id_token?: string
}

export interface GoogleUser {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name: string
  family_name: string
  picture?: string
  locale?: string
}

// ─── Functions ──────────────────────────────────────────────

/**
 * Generate the Google OAuth consent screen URL.
 * Includes a random state parameter for CSRF protection.
 */
export function getGoogleAuthUrl(state?: string): string {
  const stateValue = state || randomUUID()
  const redirectUri = `${getBaseUrl()}/api/auth/google/callback`

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'select_account',
    state: stateValue,
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for access/refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleAuthTokens> {
  const redirectUri = `${getBaseUrl()}/api/auth/google/callback`

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Token exchange failed: ${response.status} - ${errorData.error_description || errorData.error || 'Unknown error'}`
    )
  }

  return response.json()
}

/**
 * Fetch the user's Google profile using an access token.
 */
export async function getGoogleUser(accessToken: string): Promise<GoogleUser> {
  const response = await fetch(`${GOOGLE_USERINFO_URL}?access_token=${accessToken}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Google user: ${response.status}`)
  }

  return response.json()
}

/**
 * Get helper initials from a user's name (for avatar fallback).
 */
export function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
