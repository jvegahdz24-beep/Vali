// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Media Assets API
// GET  /api/media-assets?workspaceId=xxx  — list assets
// POST /api/media-assets                  — create asset
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const createSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  url: z.string().url().max(2000),
  type: z.enum(['image', 'video', 'pdf', 'audio']),
  tags: z.array(z.string().max(50)).max(20).default([]),
  description: z.string().max(1000).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const assets = await db.mediaAsset.findMany({
      where: { workspaceId, isActive: true },
      include: { triggers: { where: { isActive: true }, select: { id: true, phrase: true, intent: true, stage: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ success: true, assets })
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

    const { workspaceId, name, url, type, tags, description } = parsed.data
    await requireWorkspace(workspaceId, session.userId)

    const asset = await db.mediaAsset.create({
      data: {
        workspaceId,
        name,
        url,
        type,
        tags: JSON.stringify(tags),
        description: description ?? null,
      },
    })

    return Response.json({ success: true, asset }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
