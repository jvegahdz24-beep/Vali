import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const webhooks = await db.webhookConfig.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, webhooks })
  } catch (error) {
    return errorResponse(error, 'Error al obtener webhooks')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, channel, webhookUrl, secret, isActive } = body

    if (!workspaceId || !webhookUrl) {
      return NextResponse.json({ error: 'workspaceId and webhookUrl are required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const webhookSecret = secret || 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    const webhook = await db.webhookConfig.create({
      data: {
        workspaceId,
        channel: channel || 'webhook',
        webhookUrl,
        secret: webhookSecret,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json({ success: true, webhook })
  } catch (error) {
    return errorResponse(error, 'Error al crear webhook')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { id, workspaceId, webhookUrl, secret, channel, isActive } = body

    if (!id || !workspaceId) {
      return NextResponse.json({ error: 'id and workspaceId are required' }, { status: 400 })
    }
    await requireWorkspace(workspaceId, session.userId)

    const webhook = await db.webhookConfig.updateMany({
      where: { id, workspaceId },
      data: {
        ...(webhookUrl && { webhookUrl }),
        ...(secret && { secret }),
        ...(channel && { channel }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    if (webhook.count === 0) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'Error al actualizar webhook')
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

    const result = await db.webhookConfig.deleteMany({
      where: { id, workspaceId },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'Error al eliminar webhook')
  }
}
