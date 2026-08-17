// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Demo Login API Endpoint
// GET /api/auth/demo-login — One-click demo access with auto-provisioning
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'

// Demo access is opt-in and never has built-in credentials.
const DEMO_EMAIL = process.env.DEMO_EMAIL
const DEMO_PASSWORD = process.env.DEMO_PASSWORD
const DEMO_ACCESS_TOKEN = process.env.DEMO_ACCESS_TOKEN

function hasValidDemoAccess(req: NextRequest): boolean {
  // Never expose auto-provisioning in production, even if DEMO_MODE is set accidentally.
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE !== 'true') return false
  if (!DEMO_EMAIL || !DEMO_PASSWORD || DEMO_PASSWORD.length < 16 || !DEMO_ACCESS_TOKEN) return false

  const provided = req.headers.get('x-demo-access-token')
  if (!provided || provided.length !== DEMO_ACCESS_TOKEN.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(DEMO_ACCESS_TOKEN))
}

export async function GET(req: NextRequest) {
  if (!hasValidDemoAccess(req)) {
    // Return 404 to avoid advertising an auto-provisioning endpoint.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const demoEmail = DEMO_EMAIL
  const demoPassword = DEMO_PASSWORD
  if (!demoEmail || !demoPassword) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    // ── 1. Find or create user ──────────────────────────────────
    let user = await db.user.findUnique({
      where: { email: demoEmail },
    })

    if (!user) {
      const hashedPassword = bcrypt.hashSync(demoPassword, 12)
      user = await db.user.create({
        data: {
          email: demoEmail,
          password: hashedPassword,
          name: 'Demo ValiAutoFlow',
          role: 'owner',
          timezone: 'America/Mexico_City',
          locale: 'es-MX',
        },
      })
      console.log(`[DemoLogin] Auto-created user: ${user.email}`)
    }

    // ── 2. Find or create workspace + membership ────────────────
    const members = await db.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, isActive: true } } },
    })

    let activeMember = members.find(m => m.workspace.isActive)

    if (!activeMember) {
      if (members.length > 0) {
        // Reactivate first workspace if exists
        const firstMember = members[0]
        await db.workspace.update({
          where: { id: firstMember.workspaceId },
          data: { isActive: true },
        })
        activeMember = { ...firstMember, workspace: { id: firstMember.workspaceId, isActive: true } }
        console.log(`[DemoLogin] Auto-reactivated workspace ${firstMember.workspaceId}`)
      } else {
        // Create full workspace setup
        const workspace = await db.workspace.create({
          data: {
            name: 'ValiAutoFlow Demo',
            slug: 'valiautoflow-demo',
            industry: 'services',
            plan: 'free',
            isActive: true,
            ownerId: user.id,
          },
        })
        console.log(`[DemoLogin] Auto-created workspace: ${workspace.id}`)

        // Create workspace membership
        await db.workspaceMember.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            role: 'owner',
          },
        })

        // Create default pipeline with stages
        const pipeline = await db.pipeline.create({
          data: {
            workspaceId: workspace.id,
            name: 'Pipeline de Ventas',
            isActive: true,
            order: 0,
          },
        })

        for (let i = 0; i < DEFAULT_PIPELINE_STAGES.length; i++) {
          const stage = DEFAULT_PIPELINE_STAGES[i]
          await db.pipelineStage.create({
            data: {
              pipelineId: pipeline.id,
              name: stage.name,
              color: stage.color,
              order: i,
              probability: stage.probability,
              isWon: stage.probability === 100,
              isLost: stage.probability === 0 && stage.name === 'Cerrado Perdido',
            },
          })
        }

        // Create subscription
        const now = new Date()
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        await db.subscription.create({
          data: {
            workspaceId: workspace.id,
            plan: 'free',
            status: 'active',
            provider: 'stripe',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            amount: 0,
            currency: 'MXN',
            interval: 'monthly',
          },
        })

        // Create default agent
        await db.agent.create({
          data: {
            workspaceId: workspace.id,
            name: 'JHON',
            type: 'sales',
            personality: 'JHON',
            model: 'glm',
            modelName: 'glm-4.5-flash',
            isActive: true,
          },
        })

        activeMember = {
          id: '',
          userId: user.id,
          workspaceId: workspace.id,
          role: 'owner',
          joinedAt: new Date(),
          workspace: { id: workspace.id, isActive: true },
        }
        console.log(`[DemoLogin] Full workspace setup complete for user ${user.email}`)
      }
    }

    // ── 3. Create JWT session token ─────────────────────────────
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      workspaceId: activeMember.workspaceId,
    })

    // ── 4. Redirect to NEXUS shell with session cookie ─────────
    const response = NextResponse.redirect(new URL('/', req.url))

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    console.log(`[DemoLogin] Success: ${user.email} → workspace ${activeMember.workspaceId}`)
    return response
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[DemoLogin Error]', errMsg)

    // Redirect to login with error on failure
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('error', 'demo_setup_failed')
    return NextResponse.redirect(loginUrl)
  }
}
