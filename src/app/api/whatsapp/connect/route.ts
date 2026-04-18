import { NextRequest, NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const status = await whatsAppManager.start()

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

export async function GET() {
  try {
    const status = whatsAppManager.getStatus()

    return NextResponse.json({ success: true, status })
  } catch (error) {
    return errorResponse(error, 'Error al obtener estado')
  }
}
