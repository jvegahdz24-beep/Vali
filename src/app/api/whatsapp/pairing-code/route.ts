// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Pairing Code Endpoint
// POST /api/whatsapp/pairing-code — Connect via phone number (no QR needed)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ success: false, error: 'No workspace in session' }, { status: 400 })
    }

    const body = await req.json()
    const phoneNumber = body?.phone

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Se requiere un numero de telefono. Ejemplo: +523312345678',
      }, { status: 400 })
    }

    const { getWhatsAppManager } = await import('@/lib/whatsapp/connection')
    const manager = getWhatsAppManager(session.workspaceId)
    const connectFn = (manager as any).connectWithPairingCode
    if (typeof connectFn !== 'function') {
      return NextResponse.json({
        success: false,
        error: 'El método de conexión por código no está disponible. Usa QR escaneo.',
      }, { status: 400 })
    }
    const result = await connectFn.call(manager, phoneNumber)

    if (result.success) {
      return NextResponse.json({
        success: true,
        pairingCode: result.pairingCode,
        status: manager.getStatus(),
        message: 'Codigo de vinculacion generado. Abre WhatsApp > Dispositivos vinculados > Vincular con numero.',
      })
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
