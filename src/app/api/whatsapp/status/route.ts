import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }

    // Resolve manager strictly by the authenticated user's workspaceId.
    // This is what guarantees tenant A can't see tenant B's WhatsApp status.
    const manager = getWhatsAppManager(session.workspaceId)
    const status = manager.getStatus()

    const socketAlive = manager.isSocketAlive()
    const isGhost = status.connected && !socketAlive

    // Reconexión THROTTLEADA (ver ensureConnected): un socket fantasma o caído
    // se reintenta como máximo cada ~25s, sin importar cuántas pestañas polleen.
    // Antes cada poll de cada pestaña llamaba start() → tormenta de reconexiones
    // que nunca dejaba estabilizar (el "parpadeo" de conectar WhatsApp).
    if (isGhost) {
      manager.ensureConnected()
    } else if (!status.connected && !status.connecting) {
      // Solo auto-conecta si hay credenciales guardadas (si no, QR manual).
      const hasAuth = await db.whatsAppAuth.findFirst({
        where: { workspace: session.workspaceId },
        select: { workspace: true },
      })
      if (hasAuth) manager.ensureConnected()
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
