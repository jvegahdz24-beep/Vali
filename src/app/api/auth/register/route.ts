// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Registration API
// POST /api/auth/register — Create new user + workspace + membership
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'
import { validateBody, registerSchema } from '@/lib/validations'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { sendWelcomeEmail } from '@/lib/email'

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 registrations per minute per IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await rateLimit(`register:${clientIp}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera un momento.', code: 'RATE_LIMITED', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      )
    }

    const body = await req.json()

    const validation = validateBody(registerSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const { name, email, password } = validation.data
    const normalizedEmail = email.trim().toLowerCase()

    // ─── Check email uniqueness ─────────────────────────────
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Este correo electrónico ya está registrado' },
        { status: 409 }
      )
    }

    // ─── Hash password ──────────────────────────────────────
    const hashedPassword = hashPassword(password)

    // ─── Create User + Workspace + Membership ──────────────
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
    const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
    const pipeline = await db.pipeline.create({
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

    // ─── Send welcome email (non-blocking) ────────────────
    sendWelcomeEmail(user.email!, user.name || undefined).catch((err) => {
      console.warn('[Register] Welcome email failed (non-blocking):', err)
    })

    // ─── Success ───────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: 'Cuenta creada exitosamente',
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
      },
    })
  } catch (error) {
    console.error('[Register Error]', error)
    return NextResponse.json(
      { error: 'Error al crear la cuenta. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}
