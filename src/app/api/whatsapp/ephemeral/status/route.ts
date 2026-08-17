// GET /api/whatsapp/ephemeral/status — Poll ephemeral sessions status
import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { tryGetWhatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    const response: Record<string, unknown> = {}

    // Persistent connection status — only this workspace's manager
    const persistentMgr = tryGetWhatsAppManager(session.workspaceId)
    response.persistent = persistentMgr
      ? persistentMgr.getStatus()
      : { workspaceId: session.workspaceId, connected: false, connecting: false, qrCode: null, phone: null, lastActivity: null }

    if (clientId) {
      const client = ephemeralManager.get(clientId)
      response.client = client ? client.getStatus() : null
    } else {
      const sessions = ephemeralManager.list()
      response.ephemeralSessions = sessions
      response.ephemeralCount = sessions.length
    }

    response.anyConnected = !!(persistentMgr?.isConnected()) || !!ephemeralManager.getConnected()

    return NextResponse.json({ success: true, ...response })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado')
  }
}
