// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Pairing Code Endpoint
// POST /api/whatsapp/pairing-code — Connect via phone number (no QR needed)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const body = await req.json()
    const phoneNumber = body?.phone

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Se requiere un numero de telefono. Ejemplo: +523312345678',
      }, { status: 400 })
    }

    const { whatsAppManager } = await import('@/lib/whatsapp/connection')
    const connectFn = (whatsAppManager as any).connectWithPairingCode
    if (typeof connectFn !== 'function') {
      return NextResponse.json({
        success: false,
        error: 'El método de conexión por código no está disponible. Usa QR escaneo.',
      }, { status: 400 })
    }
    const result = await connectFn.call(whatsAppManager, phoneNumber)

    if (result.success) {
      return NextResponse.json({
        success: true,
        pairingCode: result.pairingCode,
        status: whatsAppManager.getStatus(),
        message: 'Codigo de vinculacion generado. Abre WhatsApp > Dispositivos vinculados > Vincular con numero.',
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 })
    }
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
