// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Workspaces API
// GET /api/workspaces — List user's workspaces
// POST /api/workspaces — Create workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_PIPELINE_STAGES, PLANS } from '@/lib/constants'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    const where: Record<string, unknown> = {
      OR: [
        { ownerId: session.userId },
        { members: { some: { userId: session.userId } } },
      ],
    }

    const workspaces = await db.workspace.findMany({
      where,
      include: {
        _count: {
          select: {
            members: true,
            contacts: true,
            conversations: true,
            agents: true,
            deals: true,
          },
        },
        subscription: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ items: workspaces })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { name, slug, industry = 'automotive', logo } = body

    if (!name) {
      return Response.json(
        { error: 'Missing required fields: name' },
        { status: 400 }
      )
    }

    const ownerId = session.userId

    // Generate slug from name if not provided
    const workspaceSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // Check slug uniqueness
    const existingSlug = await db.workspace.findUnique({ where: { slug: workspaceSlug } })
    if (existingSlug) {
      return Response.json(
        { error: 'A workspace with this slug already exists' },
        { status: 409 }
      )
    }

    // Get default plan limits
    const defaultPlan = PLANS.free

    // Create workspace with default pipeline
    const workspace = await db.workspace.create({
      data: {
        name,
        slug: workspaceSlug,
        ownerId,
        industry,
        logo: logo || null,
        plan: 'free',
        maxContacts: defaultPlan.limits.maxContacts,
        maxAgents: defaultPlan.limits.maxAgents,
        maxConversations: defaultPlan.limits.maxConversations,
        pipelines: {
          create: {
            name: 'Pipeline de Ventas',
            description: 'Pipeline de ventas por defecto',
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
        },
        members: {
          create: {
            userId: ownerId,
            role: 'owner',
          },
        },
        subscription: {
          create: {
            plan: 'free',
            status: 'active',
            provider: 'stripe',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            amount: 0,
            currency: 'MXN',
            interval: 'monthly',
          },
        },
      },
      include: {
        pipelines: {
          include: { stages: { orderBy: { order: 'asc' } } },
        },
        subscription: true,
      },
    })

    return Response.json({ success: true, workspace }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
