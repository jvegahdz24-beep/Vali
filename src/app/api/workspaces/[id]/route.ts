import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.url.split('/workspaces/')[1]?.split('/')[0]
    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } }
        },
        _count: { select: { contacts: true, conversations: true, deals: true, agents: true } }
      }
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, workspace })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.url.split('/workspaces/')[1]?.split('/')[0]
    await requireWorkspace(workspaceId, session.userId)

    const body = await req.json()
    const { name, industry, timezone, locale, logo } = body

    const workspace = await db.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name && { name }),
        ...(industry && { industry }),
        ...(timezone && { timezone }),
        ...(locale && { locale }),
        ...(logo !== undefined && { logo }),
      }
    })

    return NextResponse.json({ success: true, workspace })
  } catch (error) {
    return errorResponse(error)
  }
}
