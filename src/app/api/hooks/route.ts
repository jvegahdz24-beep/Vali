// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Psychological Hooks API
// GET  /api/hooks?workspaceId=xxx  — list hooks
// POST /api/hooks                  — create hook
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createSchema = z.object({
  workspaceId: z.string().min(1),
  text: z.string().min(1).max(2000),
  category: z.enum(['scarcity', 'urgency', 'social_proof', 'reciprocity', 'microclose', 'objection']),
  isDefault: z.boolean().default(false),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    const category = searchParams.get('category') || undefined
    await requireWorkspace(workspaceId, session.userId)

    const hooks = await db.hook.findMany({
      where: {
        workspaceId,
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: [{ winCount: 'desc' }, { usageCount: 'desc' }],
    })

    return Response.json({ success: true, hooks })
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

    const { workspaceId, text, category, isDefault } = parsed.data
    await requireWorkspace(workspaceId, session.userId)

    const hook = await db.hook.create({
      data: { workspaceId, text, category, isDefault },
    })

    return Response.json({ success: true, hook }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
