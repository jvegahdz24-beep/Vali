// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Pipeline API
// GET /api/pipeline — Get pipelines with stages and deals
// POST /api/pipeline — Create pipeline
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_PIPELINE_STAGES } from '@/lib/constants'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const pipelines = (await db.pipeline.findMany({
      where: { workspaceId: workspaceId!, isActive: true },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            _count: { select: { deals: true } },
            deals: {
              where: { status: 'active' },
              orderBy: { order: 'asc' },
              include: {
                contact: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    email: true,
                    avatar: true,
                    source: true,
                    tags: true,
                    notes: true,
                    leadScore: true,
                    temperature: true,
                    lastMessageAt: true,
                    createdAt: true,
                    leadProfile: {
                      select: {
                        preferredProduct: true,
                        budget: true,
                        mainObjection: true,
                        timeline: true,
                        urgencyLevel: true,
                        priceSensitivity: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { deals: true } },
      },
      orderBy: { order: 'asc' },
    })) as Array<any>

    // Calculate totals
    // Deduplicate deals by contactId across all stages — keep only the deal
    // at the most advanced stage (highest order) per contact per pipeline.
    for (const p of pipelines) {
      const stageOrderMap = new Map<string, number>(p.stages.map((s: { id: string; order: number }) => [s.id, s.order]))
      const bestDealByContact = new Map<string, { stageId: string; order: number }>()

      // First pass: find the best (most advanced) deal per contactId
      for (const s of p.stages) {
        for (const d of s.deals) {
          if (!d.contactId) continue
          const existing = bestDealByContact.get(d.contactId)
          const thisOrder = stageOrderMap.get(d.stageId) ?? 0
          if (!existing || thisOrder > existing.order) {
            bestDealByContact.set(d.contactId, { stageId: d.stageId, order: thisOrder })
          }
        }
      }

      // Second pass: remove deals that are not the best for their contact
      for (const s of p.stages) {
        s.deals = s.deals.filter((d: { contactId: string | null; stageId: string }) => {
          if (!d.contactId) return true // keep deals without contact
          const best = bestDealByContact.get(d.contactId)
          return best?.stageId === d.stageId
        })
      }
    }

    const totalPipelineValue = pipelines.reduce(
      (sum, p) =>
        sum +
        p.stages.reduce(
          (stageSum, s) =>
            stageSum + s.deals.reduce((dealSum, d) => dealSum + d.value, 0),
          0
        ),
      0
    )

    return Response.json({
      items: pipelines,
      totalPipelineValue,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, name, description, stages } = body

    await requireWorkspace(workspaceId, session.userId)

    if (!name) {
      return Response.json(
        { error: 'Missing required fields: name' },
        { status: 400 }
      )
    }

    // Create pipeline with default stages or custom stages
    const pipelineStages = stages || DEFAULT_PIPELINE_STAGES

    const pipeline = await db.pipeline.create({
      data: {
        workspaceId,
        name,
        description: description || null,
        stages: {
          create: pipelineStages.map((stage: { name: string; color: string; probability: number }, index: number) => ({
            name: stage.name,
            color: stage.color || '#6366f1',
            order: index,
            probability: stage.probability || 0,
            isWon: stage.name.toLowerCase().includes('ganado'),
            isLost: stage.name.toLowerCase().includes('perdido'),
          })),
        },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    })

    return Response.json({ success: true, pipeline }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
