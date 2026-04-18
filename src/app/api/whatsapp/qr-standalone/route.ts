// TEMPORARY: QR standalone endpoint — no auth required
import { NextResponse } from 'next/server'
import { whatsAppManager } from '@/lib/whatsapp/connection'

export async function GET() {
  try {
    // Start connection if not started
    const status = whatsAppManager.getStatus()
    if (!status.connecting && !status.connected) {
      await whatsAppManager.start()
    }

    // Wait up to 10s for QR
    for (let i = 0; i < 20; i++) {
      const s = whatsAppManager.getStatus()
      if (s.qrCode) {
        // Return as PNG image
        const pngBuffer = Buffer.from(s.qrCode, 'base64')
        return new NextResponse(pngBuffer, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': pngBuffer.length.toString(),
            'Cache-Control': 'no-cache',
          },
        })
      }
      if (s.connected) {
        return NextResponse.json({ 
          success: true, 
          message: 'WhatsApp ya está conectado', 
          phone: s.phone 
        })
      }
      await new Promise(r => setTimeout(r, 500))
    }

    return NextResponse.json({ 
      error: 'QR no disponible aún. Intenta de nuevo en 5 segundos.', 
      connecting: true 
    }, { status: 503 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
