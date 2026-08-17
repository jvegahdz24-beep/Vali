// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Education Campaign [id] API
// GET    /api/education-campaigns/[id]?workspaceId=xxx  — detail
// PUT    /api/education-campaigns/[id]                  — update
// DELETE /api/education-campaigns/[id]                  — delete
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  trigger: z.enum(['new_lead', 'inactive_3d', 'inactive_7d', 'quoted', 'custom']).optional(),
  isActive: z.boolean().optional(),
})

const stepSchema = z.object({
  workspaceId: z.string().min(1),
  stepNumber: z.number().int().min(1),
  delayMinutes: z.number().int().min(0),
  type: z.enum(['text', 'image', 'video', 'pdf']),
  content: z.string().min(1).max(4000),
  assetId: z.string().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const campaign = await db.educationCampaign.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        executions: { where: { status: 'active' }, select: { id: true, contactId: true, currentStep: true, nextStepAt: true } },
      },
    })

    if (!campaign || campaign.workspaceId !== workspaceId) {
      return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    return Response.json({ success: true, campaign })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const body = await req.json()

    // Check if it's a step addition or campaign update
    if ('stepNumber' in body) {
      const parsed = stepSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
      }
      const { workspaceId, stepNumber, delayMinutes, type, content, assetId } = parsed.data
      await requireWorkspace(workspaceId, session.userId)

      const campaign = await db.educationCampaign.findUnique({ where: { id }, select: { workspaceId: true } })
      if (!campaign || campaign.workspaceId !== workspaceId) {
        return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })
      }

      const step = await db.educationStep.upsert({
        where: { campaignId_stepNumber: { campaignId: id, stepNumber } },
        create: { campaignId: id, stepNumber, delayMinutes, type, content, assetId: assetId ?? null },
        update: { delayMinutes, type, content, assetId: assetId ?? null },
      })

      return Response.json({ success: true, step })
    }

    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { workspaceId, ...rest } = parsed.data
    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.educationCampaign.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    const campaign = await db.educationCampaign.update({ where: { id }, data: rest })
    return Response.json({ success: true, campaign })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.educationCampaign.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    // Cascade: cancel active executions, delete steps
    await db.educationExecution.updateMany({ where: { campaignId: id, status: 'active' }, data: { status: 'cancelled' } })
    await db.educationStep.deleteMany({ where: { campaignId: id } })
    await db.educationCampaign.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
