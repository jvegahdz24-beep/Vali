// GET /api/whatsapp/ephemeral/status — Poll ephemeral sessions status
import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { tryGetWhatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }
    await requireWorkspace(session.workspaceId, session.userId)

    const scope = { ownerId: session.userId, workspaceId: session.workspaceId }
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    const response: Record<string, unknown> = {}

    // Persistent connection status — only this workspace's manager
    const persistentMgr = tryGetWhatsAppManager(session.workspaceId)
    response.persistent = persistentMgr
      ? persistentMgr.getStatus()
      : { workspaceId: session.workspaceId, connected: false, connecting: false, qrCode: null, phone: null, lastActivity: null }

    if (clientId) {
      const client = ephemeralManager.get(clientId, scope)
      response.client = client ? client.getStatus() : null
    } else {
      const sessions = ephemeralManager.list(scope)
      response.ephemeralSessions = sessions
      response.ephemeralCount = sessions.length
    }

    response.anyConnected = !!(persistentMgr?.isConnected()) || !!ephemeralManager.getConnected(scope)

    return NextResponse.json({ success: true, ...response })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado')
  }
}
