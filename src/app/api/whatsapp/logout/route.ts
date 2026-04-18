import { NextRequest, NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const success = await whatsAppManager.stop()

    if (success) {
      return NextResponse.json({ success: true, message: 'WhatsApp desconectado' })
    } else {
      return NextResponse.json({ success: false, error: 'Error al desconectar WhatsApp' }, { status: 500 })
    }
  } catch (error) {
    return errorResponse(error, 'Error al desconectar WhatsApp')
  }
}
