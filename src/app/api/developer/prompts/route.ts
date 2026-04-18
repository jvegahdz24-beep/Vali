import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

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
      bySlug: personas.reduce<Record<string, typeof personas[0]>>((acc, p) => {
        acc[p.slug] = p
        return acc
      }, {}),
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener prompts')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, slug, systemPrompt, tone, language } = body

    if (!workspaceId || !slug) {
      return NextResponse.json({ error: 'workspaceId and slug are required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    if (!systemPrompt) {
      return NextResponse.json({ error: 'systemPrompt is required' }, { status: 400 })
    }

    const persona = await db.agentPersona.upsert({
      where: { workspaceId_slug: { workspaceId, slug } },
      create: {
        workspaceId,
        name: slug,
        slug,
        systemPrompt,
        tone: tone || 'professional',
        language: language || 'es',
        isActive: true,
        isDefault: false,
      },
      update: {
        systemPrompt,
        ...(tone && { tone }),
        ...(language && { language }),
      },
    })

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
    await requireWorkspace(workspaceId, session.userId)

    await db.agentPersona.deleteMany({ where: { id, workspaceId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'Error al eliminar prompt')
  }
}
