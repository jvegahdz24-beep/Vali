// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Media Asset [id] API
// PUT    /api/media-assets/[id]  — update
// DELETE /api/media-assets/[id]  — soft-delete (isActive=false)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const updateSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().max(2000).optional(),
  type: z.enum(['image', 'video', 'pdf', 'audio']).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { workspaceId, tags, ...rest } = parsed.data
    await requireWorkspace(workspaceId, session.userId)

    // Verify asset belongs to workspace
    const existing = await db.mediaAsset.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return Response.json({ error: 'Activo no encontrado' }, { status: 404 })
    }

    const asset = await db.mediaAsset.update({
      where: { id },
      data: {
        ...rest,
        ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
      },
    })

    return Response.json({ success: true, asset })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.mediaAsset.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing || existing.workspaceId !== workspaceId) {
      return Response.json({ error: 'Activo no encontrado' }, { status: 404 })
    }

    await db.mediaAsset.update({ where: { id }, data: { isActive: false } })

    return Response.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
