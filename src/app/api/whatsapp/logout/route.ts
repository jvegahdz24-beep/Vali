import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }
    const manager = getWhatsAppManager(session.workspaceId)
    const success = await manager.stop()

    if (success) {
      return NextResponse.json({ success: true, message: 'WhatsApp desconectado' })
    } else {
      return NextResponse.json({ success: false, error: 'Error al desconectar WhatsApp' }, { status: 500 })
    }
  } catch (error) {
    return errorResponse(error, 'Error al desconectar WhatsApp')
  }
}
