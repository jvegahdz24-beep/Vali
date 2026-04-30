import { NextRequest, NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const status = whatsAppManager.getStatus()

    // FIX P4: Check actual socket liveness, not just in-memory flag.
    // The `socketAlive` field checks if the Baileys WebSocket is OPEN,
    // preventing "ghost connection" where _connected=true but socket is dead.
    const socketAlive = whatsAppManager.isSocketAlive()
    const isGhost = status.connected && !socketAlive

    // If ghost detected: log it and trigger silent reconnect
    if (isGhost) {
      console.warn('[Status] Ghost connection detected — triggering silent reconnect')
      // Non-blocking reconnect attempt
      whatsAppManager.start().catch((err) => {
        console.error('[Status] Auto-reconnect failed:', err)
      })
    }

    return NextResponse.json({
      success: true,
      connected: status.connected && socketAlive,
      connecting: status.connecting || isGhost, // show connecting during reconnect
      qrCode: status.qrCode,
      phone: status.phone,
      lastActivity: status.lastActivity,
      socketAlive,
      ghostDetected: isGhost, // expose for monitoring
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado de WhatsApp')
  }
}
