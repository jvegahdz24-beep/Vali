// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Education Campaigns API
// GET  /api/education-campaigns?workspaceId=xxx  — list campaigns
// POST /api/education-campaigns                  — create campaign
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  trigger: z.enum(['new_lead', 'inactive_3d', 'inactive_7d', 'quoted', 'custom']),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const campaigns = await db.educationCampaign.findMany({
      where: { workspaceId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ success: true, campaigns })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { workspaceId, name, description, trigger } = parsed.data
    await requireWorkspace(workspaceId, session.userId)

    const campaign = await db.educationCampaign.create({
      data: { workspaceId, name, description: description ?? null, trigger },
    })

    return Response.json({ success: true, campaign }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
