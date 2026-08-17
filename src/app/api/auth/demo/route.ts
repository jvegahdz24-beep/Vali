// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Demo Login API
// POST /api/auth/demo — Create/login demo user with a pre-built workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'
import { rateLimit } from '@/lib/rate-limit'

const DEMO_EMAIL = 'demo@valiautoflow.com'
const DEMO_PASSWORD = 'DemoVali2025!'
const DEMO_NAME = 'Usuario Demo'

export async function POST(req: NextRequest) {
  // Rate limit: 5 demo logins per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  const rl = rateLimit(`demo:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes de demo. Intenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter ?? 3600))) } }
    )
  }

  try {
    // Find or create the demo user
    let user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })

    if (!user) {
      const hashedPassword = bcrypt.hashSync(DEMO_PASSWORD, 10)
      user = await db.user.create({
        data: {
          name: DEMO_NAME,
          email: DEMO_EMAIL,
          password: hashedPassword,
          role: 'owner',
          timezone: 'America/Mexico_City',
          locale: 'es-MX',
        },
      })
    }

    // Find or create the demo workspace
    let member = await db.workspaceMember.findFirst({
      where: { userId: user.id },
      include: { workspace: true },
    })

    if (!member) {
      const workspace = await db.workspace.create({
        data: {
          name: 'Demo Workspace',
          slug: 'demo-workspace',
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
          }),
          members: {
            create: { userId: user.id, role: 'owner' },
          },
        },
      })

      // Create default pipeline
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

      // Create default subscription
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

      member = await db.workspaceMember.findFirst({
        where: { userId: user.id },
        include: { workspace: true },
      })
    }

    // Create JWT session
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name || DEMO_NAME,
      role: user.role,
      workspaceId: member?.workspaceId,
    })

    const response = NextResponse.json({ success: true })

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // SEC-003
      sameSite: 'lax',
      maxAge: 2 * 60 * 60, // 2 hours for demo sessions
      path: '/',
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: 'Error al iniciar la demo. Intenta de nuevo.' },
      { status: 500 }
    )
  }
}
