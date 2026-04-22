// GET /api/whatsapp/ephemeral/status — Poll ephemeral sessions status
import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    const response: Record<string, unknown> = {}

    // Persistent connection status
    response.persistent = whatsAppManager.getStatus()

    // Ephemeral sessions
    if (clientId) {
      const client = ephemeralManager.get(clientId)
      response.client = client ? client.getStatus() : null
    } else {
      response.ephemeralSessions = ephemeralManager.list()
      response.ephemeralCount = response.ephemeralSessions.length
    }

    // Check if any connection is available for sending
    response.anyConnected = whatsAppManager.isConnected() || !!ephemeralManager.getConnected()

    return NextResponse.json({ success: true, ...response })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado')
  }
}
