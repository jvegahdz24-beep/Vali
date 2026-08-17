import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }

    // Per-tenant manager — NEVER touch other workspaces' auth records.
    const manager = getWhatsAppManager(session.workspaceId)
    const body = await req.json().catch(() => ({}))
    const force = body?.force === true
    const status = await manager.start(force)

    return NextResponse.json({
      success: true,
      status: {
        connected: status.connected,
        connecting: status.connecting,
        qrCode: status.qrCode,
        phone: status.phone,
        lastActivity: status.lastActivity,
      },
      message: status.connected
        ? 'WhatsApp already connected'
        : status.connecting
          ? 'Connecting... scan QR code'
          : 'Connection initiated',
    })
  } catch (error) {
    return errorResponse(error, 'Error al conectar WhatsApp')
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }
    const manager = getWhatsAppManager(session.workspaceId)
    const status = manager.getStatus()
    return NextResponse.json({ success: true, status })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado')
  }
}
