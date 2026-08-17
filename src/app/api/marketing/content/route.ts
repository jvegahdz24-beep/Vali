import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

// GET /api/marketing/content?workspaceId=xxx&campaignId=xxx
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    const campaignId = searchParams.get('campaignId') || undefined
    const channel = searchParams.get('channel') || undefined
    const type = searchParams.get('type') || undefined

    await requireWorkspace(workspaceId, session.userId)

    const contents = await db.marketingContent.findMany({
      where: {
        workspaceId,
        ...(campaignId ? { campaignId } : {}),
        ...(channel ? { channel } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json({ contents })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/marketing/content
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, campaignId, type, channel, title, content, tone, objective, metadata } = body

    if (!workspaceId || !type || !channel || !title || !content) {
      return Response.json({ error: 'workspaceId, type, channel, title y content son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const item = await db.marketingContent.create({
      data: {
        workspaceId,
        campaignId: campaignId || null,
        type,
        channel,
        title,
        content,
        tone: tone || 'neutral',
        objective: objective || 'leads',
        aiGenerated: body.aiGenerated === true,
        metadata: JSON.stringify(metadata || {}),
      },
    })

    return Response.json({ content: item }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

// PATCH /api/marketing/content
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, workspaceId, ...updates } = body

    if (!id || !workspaceId) {
      return Response.json({ error: 'id y workspaceId son requeridos' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.marketingContent.findFirst({ where: { id, workspaceId } })
    if (!existing) {
      return Response.json({ error: 'Contenido no encontrado' }, { status: 404 })
    }

    const data: Parameters<typeof db.marketingContent.update>[0]['data'] = {}
    if (updates.title !== undefined) data.title = updates.title
    if (updates.content !== undefined) data.content = updates.content
    if (updates.tone !== undefined) data.tone = updates.tone
    if (updates.objective !== undefined) data.objective = updates.objective
    if (updates.status !== undefined) data.status = updates.status
    if (updates.campaignId !== undefined) data.campaignId = updates.campaignId || null
    if (updates.metadata !== undefined) data.metadata = JSON.stringify(updates.metadata)

    const item = await db.marketingContent.update({ where: { id }, data })

    return Response.json({ content: item })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/marketing/content?id=xxx&workspaceId=xxx
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') || ''
    const workspaceId = searchParams.get('workspaceId') || ''

    await requireWorkspace(workspaceId, session.userId)

    const existing = await db.marketingContent.findFirst({ where: { id, workspaceId } })
    if (!existing) {
      return Response.json({ error: 'Contenido no encontrado' }, { status: 404 })
    }

    await db.marketingContent.delete({ where: { id } })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
