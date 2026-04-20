// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Logs Endpoint
// GET /api/whatsapp/logs — Returns recent connection logs
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { whatsAppManager } = await import('@/lib/whatsapp/connection')
    const logs = whatsAppManager.getLogs()
    const status = whatsAppManager.getStatus()

    return NextResponse.json({
      success: true,
      logs,
      lastError: whatsAppManager.getLastError(),
      status,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      logs: [],
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
