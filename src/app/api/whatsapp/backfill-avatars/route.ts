import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { requireAuth, errorResponse } from '@/lib/api-auth'

// POST /api/whatsapp/backfill-avatars
// Rellena contact.avatar con la foto de perfil de WhatsApp para los contactos
// del workspace que aún no tienen. Requiere WhatsApp conectado.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }
    const manager = getWhatsAppManager(session.workspaceId)
    const status = manager.getStatus()
    if (!status.connected) {
      return NextResponse.json({ error: 'WhatsApp no está conectado' }, { status: 409 })
    }
    const result = await manager.backfillAvatars(300)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return errorResponse(error)
  }
}
