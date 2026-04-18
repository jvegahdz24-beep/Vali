import { NextRequest, NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
    const status = whatsAppManager.getStatus()

    return NextResponse.json({
      success: true,
      connected: status.connected,
      connecting: status.connecting,
      qrCode: status.qrCode,
      phone: status.phone,
      lastActivity: status.lastActivity,
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado de WhatsApp')
  }
}
