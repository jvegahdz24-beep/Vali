import { NextRequest, NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const status = whatsAppManager.getStatus()

    // FIX: Expose the actual socket liveness state, not just the in-memory flag.
    // The `socketAlive` field checks if the Baileys socket reference is still valid,
    // preventing "ghost connection" where _connected=true but socket is actually dead.
    const socketAlive = whatsAppManager.isSocketAlive()

    return NextResponse.json({
      success: true,
      connected: status.connected && socketAlive,
      connecting: status.connecting,
      qrCode: status.qrCode,
      phone: status.phone,
      lastActivity: status.lastActivity,
      socketAlive,
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado de WhatsApp')
  }
}
