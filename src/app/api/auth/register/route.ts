// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM — Registration API Endpoint
// POST /api/auth/register — Create User + Workspace + Membership
// Issues access + refresh tokens (auto-login after registration)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'
import { logInfo, logOk, logWarn, logError } from '@/lib/logger'
import { hashPassword } from '@/lib/auth/auth'
import {
  createTokenPair,
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '@/lib/auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ─── Validation ───────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

// ─── Cookie Helpers ───────────────────────────────────────────

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

const ACCESS_MAX_AGE = 15 * 60        // 900 seconds (15 minutes)
const REFRESH_MAX_AGE = 7 * 24 * 3600 // 604800 seconds (7 days)

// ─── Route Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  logInfo('AUTH', 'register_start', {})

  try {
    // Rate limit: 3 registrations per minute per IP
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    const rl = await rateLimit(`register:${clientIp}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs)
    if (!rl.success) {
      logWarn('AUTH', 'register_rate_limited', { ip: clientIp })
      return NextResponse.json(
        { error: 'Too many registration attempts. Try again later.', code: 'RATE_LIMITED', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
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

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('. ')
      return NextResponse.json(
        { error: message, code: 'VALIDATION_ERROR' },
        { status: 400 },
      )
    }

    const { name, email, password } = parsed.data
    const normalizedEmail = email.trim().toLowerCase()

    // ─── Check email uniqueness ─────────────────────────────
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      logWarn('AUTH', 'register_email_exists', { email: normalizedEmail })
      return NextResponse.json(
        { error: 'An account with this email already exists', code: 'EMAIL_EXISTS' },
        { status: 409 },
      )
    }

    // ─── Hash password ──────────────────────────────────────
    const hashedPassword = hashPassword(password)

    // ─── Create User + Workspace + Membership (transaction) ─
    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: 'owner',
        timezone: 'America/Mexico_City',
        locale: 'es-MX',
      },
    })

    // Generate workspace slug from name
    const baseSlug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const uniqueSlug = `${baseSlug}-workspace`

    const workspace = await db.workspace.create({
      data: {
        name: `${name.trim()} Workspace`,
        slug: uniqueSlug,
        ownerId: user.id,
        industry: 'services',
        plan: 'free',
        maxContacts: 100,
        maxAgents: 1,
        maxConversations: 50,
        settings: JSON.stringify({
          businessHours: 'Lun-Sab 9:00-19:00',
          timezone: 'America/Mexico_City',
          currency: 'MXN',
          defaultPersonality: 'JHON',
        }),
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
      },
    })

    // ─── Create default pipeline ───────────────────────────
    await db.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Pipeline de Ventas',
        description: 'Pipeline principal de ventas',
        order: 0,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
            name: stage.name,
            color: stage.color,
            order: index,
            probability: stage.probability,
            isWon: stage.name.toLowerCase().includes('ganado'),
            isLost: stage.name.toLowerCase().includes('perdido'),
          })),
        },
      },
    })

    // ─── Create default subscription (free plan) ──────────
    await db.subscription.create({
      data: {
        workspaceId: workspace.id,
        plan: 'free',
        status: 'active',
        provider: 'stripe',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        amount: 0,
        currency: 'MXN',
        interval: 'monthly',
      },
    })

    // ─── Issue tokens (auto-login) ─────────────────────────
    const tokens = await createTokenPair({
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      workspaceId: workspace.id,
    })

    // ─── Build response ─────────────────────────────────────
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
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

    logOk('AUTH', 'register_success', {
      userId: user.id,
      email: user.email,
      workspaceId: workspace.id,
    })

    return response
  } catch (err) {
    logError('AUTH', 'register_unexpected_error', err)
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
