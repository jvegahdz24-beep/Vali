// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Login API Endpoint
// POST /api/auth/login — Authenticate user, issue access + refresh tokens
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { config } from '@/lib/config'
import { logInfo, logOk, logWarn, logError } from '@/lib/logger'
import { comparePassword } from '@/lib/auth/auth'
import {
  createTokenPair,
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ─── Validation ───────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

// ─── Cookie Helpers ───────────────────────────────────────────

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

const ACCESS_MAX_AGE = 15 * 60       // 900 seconds (15 minutes)
const REFRESH_MAX_AGE = 7 * 24 * 3600 // 604800 seconds (7 days)

// ─── Password Verification ────────────────────────────────────

/**
 * Compare password against stored hash.
 * Supports both bcrypt hashes ($2a/$2b/$2y$) and legacy SHA-256 hashes
 * for accounts created before the bcrypt migration.
 */
function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('$2')) {
    return comparePassword(password, storedHash)
  }
  // Legacy SHA-256 fallback
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex')
  return legacyHash === storedHash
}

// ─── Route Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const timer = logInfo('AUTH', 'login_start', {})

  try {
    // Rate limit: 10 login attempts per minute per IP
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const rateLimitResult = await rateLimit(`${clientIp}:login`, 10, 60_000)
    if (!rateLimitResult.success) {
      logWarn('AUTH', 'login_rate_limited', { ip: clientIp })
      return NextResponse.json(
        { error: 'Too many login attempts. Try again in a minute.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
      )
    }

    // Parse & validate request body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON.', code: 'BAD_REQUEST' },
        { status: 400 },
      )
    }

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('. ')
      return NextResponse.json(
        { error: message, code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const { email, password } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    // ─── Lookup user ─────────────────────────────────────────
    let user
    try {
      user = await db.user.findUnique({
        where: { email: normalizedEmail },
      })
    } catch (err) {
      // DB unreachable — return 401 to avoid leaking internal errors
      logError('AUTH', 'login_db_error', err, { email: normalizedEmail })
      return NextResponse.json(
        { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      )
    }

    if (!user || !user.password) {
      logWarn('AUTH', 'login_user_not_found', { email: normalizedEmail })
      return NextResponse.json(
        { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      )
    }

    // ─── Verify password ─────────────────────────────────────
    const isPasswordValid = verifyPassword(password, user.password)

    if (!isPasswordValid) {
      logWarn('AUTH', 'login_invalid_password', { userId: user.id })
      return NextResponse.json(
        { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        { status: 401 },
      )
    }

    // ─── Get active workspace ────────────────────────────────
    const members = await db.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, isActive: true } } },
    })

    let activeWorkspaceId: string | undefined

    // Prefer active workspace, fallback to first available
    let activeMember = members.find((m) => m.workspace.isActive)
    if (!activeMember && members.length > 0) {
      const firstMember = members[0]
      await db.workspace.update({
        where: { id: firstMember.workspaceId },
        data: { isActive: true },
      })
      activeMember = { ...firstMember, workspace: { id: firstMember.workspaceId, isActive: true } }
      logInfo('AUTH', 'login_workspace_reactivated', { workspaceId: firstMember.workspaceId, userId: user.id })
    }
    activeWorkspaceId = activeMember?.workspaceId

    // ─── Create token pair ──────────────────────────────────
    const sessionPayload = {
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      workspaceId: activeWorkspaceId,
    }

    const tokens = await createTokenPair(sessionPayload)

    // ─── Build response ─────────────────────────────────────
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
    })

    // Set access token cookie
    response.cookies.set(SESSION_COOKIE_NAME, tokens.accessToken, {
      ...cookieBase,
      maxAge: ACCESS_MAX_AGE,
    })

    // Set refresh token cookie
    response.cookies.set(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      ...cookieBase,
      maxAge: REFRESH_MAX_AGE,
    })

    logOk('AUTH', 'login_success', {
      userId: user.id,
      email: user.email,
      workspaceId: activeWorkspaceId ?? 'none',
    })

    return response
  } catch (err) {
    logError('AUTH', 'login_unexpected_error', err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
