import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'
import { invalidatePersonalityCache } from '@/lib/ai/message-processor'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const slug = searchParams.get('slug')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const personas = await db.agentPersona.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        systemPrompt: true,
        tone: true,
        language: true,
        isActive: true,
        isDefault: true,
      },
    })

    return NextResponse.json({
      success: true,
      personas,
      bySlug: personas.reduce((acc: Record<string, (typeof personas)[0]>, p) => {
        acc[p.slug] = p
        return acc
      }, {} as Record<string, (typeof personas)[0]>),
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener prompts')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, slug, name, systemPrompt, tone, language, isActive } = body

    if (!workspaceId || !slug) {
      return NextResponse.json({ error: 'workspaceId and slug are required' }, { status: 400 })
    }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')

    if (!systemPrompt) {
      return NextResponse.json({ error: 'systemPrompt is required' }, { status: 400 })
    }

    const persona = await db.agentPersona.upsert({
      where: { workspaceId_slug: { workspaceId, slug } },
      create: {
        workspaceId,
        name: name || slug,
        slug,
        systemPrompt,
        tone: tone || 'professional',
        language: language || 'es',
        isActive: isActive !== undefined ? isActive : true,
        isDefault: false,
      },
      update: {
        ...(name && { name }),
        systemPrompt,
        ...(tone && { tone }),
        ...(language && { language }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    // Invalidate personality cache so the next message uses the new prompt immediately
    invalidatePersonalityCache(workspaceId)

    return NextResponse.json({
      success: true,
      persona: { id: persona.id, slug: persona.slug, name: persona.name },
    })
  } catch (error) {
    return errorResponse(error, 'Error al guardar prompt')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const id = searchParams.get('id')

    if (!workspaceId || !id) {
      return NextResponse.json({ error: 'workspaceId and id are required' }, { status: 400 })
    }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')

    await db.agentPersona.deleteMany({ where: { id, workspaceId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'Error al eliminar prompt')
  }
}
