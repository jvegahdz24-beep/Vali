// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SaaS Client Registration API
// POST /api/saas/register — Create new client business account
// Creates: User (owner) → Workspace → WorkspaceMember → Agent
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { rateLimit } from '@/lib/rate-limit'
import { JHON_SYSTEM_PROMPT } from '@/lib/constants'

// ─── Validation Schema ─────────────────────────────────────────

const saasRegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  businessName: z.string().min(2, 'Business name is required').max(200),
  industry: z.string().min(1, 'Industry is required').max(100),
  phone: z.string().optional(),
})

// ─── Rate Limit: 5 registrations per IP per hour ───────────────

const SAAS_REGISTER_LIMIT = 5
const SAAS_REGISTER_WINDOW_MS = 60 * 60 * 1000 // 1 hour

// ─── Password Hashing ──────────────────────────────────────────

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

// ─── POST Handler ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ─── Rate Limit ──────────────────────────────────────────
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')?.trim()
      || 'unknown'

    const rl = rateLimit(
      `saas:register:${clientIp}`,
      SAAS_REGISTER_LIMIT,
      SAAS_REGISTER_WINDOW_MS
    )

    if (!rl.success) {
      return NextResponse.json(
        {
          error: 'Too many registration attempts. Please try again later.',
          code: 'RATE_LIMITED',
          retryAfter: rl.retryAfter,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter) },
        }
      )
    }

    // ─── Validate Input ──────────────────────────────────────
    const body = await req.json()
    const parsed = saasRegisterSchema.safeParse(body)

    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => i.message).join('. ')
      return NextResponse.json(
        { error: errors, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const { name, email, password, businessName, industry, phone } = parsed.data
    const normalizedEmail = email.trim().toLowerCase()

    // ─── Hash Password ───────────────────────────────────────
    const hashedPassword = hashPassword(password)

    // ─── Create User + Workspace + Agent + Subscription in a single transaction ──
    // FIX CRITICAL: Prevents race conditions (TOCTOU) and ensures atomic rollback on failure
    const baseSlug = businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50)

    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`

    const now = new Date()
    const periodEnd = new Date(now)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    let result: { user: any; workspace: any; agent: any }
    try {
      result = await db.$transaction(async (tx) => {
        // Check + Create in one transaction — no race window
        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
        })

        if (existingUser) {
          // @ts-ignore — throw with code for catch block
          const err = new Error('Email already registered')
          ;(err as any).code = 'P2002'
          ;(err as any).field = 'email'
          throw err
        }

        const user = await tx.user.create({
          data: {
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: 'owner',
            phone: phone?.trim() || null,
            timezone: 'America/Mexico_City',
            locale: 'es-MX',
          },
        })

        const workspace = await tx.workspace.create({
          data: {
            name: businessName.trim(),
            slug: uniqueSlug,
            ownerId: user.id,
            industry: industry.trim().toLowerCase(),
            plan: 'starter',
            maxContacts: 100,
            maxAgents: 3,
            maxConversations: 500,
            settings: JSON.stringify({
              businessHours: 'Lun-Sab 9:00-19:00',
              timezone: 'America/Mexico_City',
              currency: 'MXN',
              defaultPersonality: 'JHON',
              saas: {
                registeredAt: new Date().toISOString(),
                onboardingCompleted: false,
              },
            }),
            members: {
              create: {
                userId: user.id,
                role: 'owner',
              },
            },
          },
        })

        const agent = await tx.agent.create({
          data: {
            workspaceId: workspace.id,
            name: 'JHON - Asesor de Ventas',
            type: 'sales',
            description: 'Agente de ventas principal con personalidad JHON. Califica leads y cierra ventas.',
            isActive: true,
            personality: 'JHON',
            systemPrompt: JHON_SYSTEM_PROMPT,
            model: 'glm',
            modelName: 'glm-4.5-flash',
            temperature: 0.7,
            maxTokens: 4096,
            priority: 10,
          },
        })

        // FIX HIGH: Prevent double subscription (race condition on same workspace)
        await tx.subscription.upsert({
          where: {
            id: `free-${workspace.id}`, // deterministic ID
          },
          create: {
            id: `free-${workspace.id}`,
            workspaceId: workspace.id,
            plan: 'starter',
            status: 'active',
            provider: 'internal',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            amount: 0,
            currency: 'USD',
            interval: 'monthly',
          },
          update: {}, // no-op if exists
        })

        return { user, workspace, agent }
      }, { timeout: 30000 })
    } catch (txErr: any) {
      if (txErr.code === 'P2002' || txErr.field === 'email') {
        return NextResponse.json(
          { error: 'This email is already registered.', code: 'EMAIL_TAKEN' },
          { status: 409 }
        )
      }
      throw txErr
    }

    const { user, workspace, agent } = result

    // ─── Create Session Token ────────────────────────────────
    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      name: user.name || '',
      role: user.role,
      workspaceId: workspace.id,
    })

    // ─── Success Response ───────────────────────────────────
    const response = NextResponse.json({
      success: true,
      workspaceId: workspace.id,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
        industry: workspace.industry,
      },
      agent: {
        id: agent.id,
        name: agent.name,
        personality: agent.personality,
      },
    })

    // Set session cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    return response
  } catch (error) {
    console.error('[SaaS Register Error]', error)
    return NextResponse.json(
      {
        error: 'Failed to create account. Please try again.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }
}
