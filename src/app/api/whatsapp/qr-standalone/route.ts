// DISABLED: This endpoint had NO authentication and operated on a single
// global WhatsApp manager. In a multi-tenant system that is unsafe — it
// could expose another workspace's QR or hijack their session. Use the
// authenticated /api/whatsapp/status endpoint instead.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Endpoint deshabilitado. Usa /api/whatsapp/status (requiere autenticación).' },
    { status: 410 }
  )
}
