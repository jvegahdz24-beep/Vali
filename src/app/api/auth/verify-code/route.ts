// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Verify Email Code + Create Account
// POST /api/auth/verify-code
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPending, incrementAttempts, deletePending } from '@/lib/verification-store'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'
import { acceptPendingInvitations } from '@/lib/auth/accept-invitations'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, code } = body

    if (!email || !code) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const trimmedCode = String(code).trim()

    const pending = await getPending(normalizedEmail)

    if (!pending) {
      return NextResponse.json(
        { error: 'Código expirado o no encontrado. Solicita uno nuevo.' },
        { status: 400 }
      )
    }

    // Check expiry
    if (Date.now() > pending.expiresAt) {
      await deletePending(normalizedEmail)
      return NextResponse.json(
        { error: 'El código ha expirado. Solicita uno nuevo.' },
        { status: 400 }
      )
    }

    // Check max attempts
    if (pending.attempts >= 5) {
      await deletePending(normalizedEmail)
      return NextResponse.json(
        { error: 'Demasiados intentos incorrectos. Solicita un nuevo código.' },
        { status: 400 }
      )
    }

    // Verify code
    if (trimmedCode !== pending.code) {
      await incrementAttempts(normalizedEmail)
      const remaining = 4 - pending.attempts
      return NextResponse.json(
        { error: `Código incorrecto. Te quedan ${remaining} intentos.` },
        { status: 400 }
      )
    }

    // ─── Code is valid → Create account ───────────────────────
    await deletePending(normalizedEmail)

    // Double-check email not registered (race condition guard)
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { error: 'Este correo ya está registrado. Inicia sesión.' },
        { status: 409 }
      )
    }

    // Create User + Workspace + Membership + Pipeline + Subscription atomically
    const user = await db.user.create({
      data: {
        name: pending.name,
        email: normalizedEmail,
        password: pending.hashedPassword,
        emailVerified: new Date(),
        role: 'owner',
        timezone: 'America/Mexico_City',
        locale: 'es-MX',
      },
    })

    // Auto-aceptar invitaciones pendientes para este email (belt-and-suspenders
    // además del callbackUrl a /accept-invite): así el nuevo usuario queda en el
    // equipo que lo invitó aunque el redirect falle.
    await acceptPendingInvitations(user.id, normalizedEmail)

    const baseSlug = pending.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const uniqueSlug = `${baseSlug}-${user.id.slice(-6)}`

    const workspace = await db.workspace.create({
      data: {
        name: `${pending.name} Workspace`,
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
          create: { userId: user.id, role: 'owner' },
        },
      },
    })

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

    // ─── Create session cookie ─────────────────────────────────
    const token = await createSessionToken({
      userId: user.id,
      email: normalizedEmail,
      name: pending.name,
      role: 'owner',
      workspaceId: workspace.id,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Cuenta creada exitosamente.',
      redirectTo: '/select-plan',
    })

    const isProduction = process.env.NODE_ENV === 'production'
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[verify-code] Error:', error)
    return NextResponse.json({ error: 'Error al verificar el código.' }, { status: 500 })
  }
}
