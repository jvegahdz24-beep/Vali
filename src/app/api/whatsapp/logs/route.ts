// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Logs Endpoint
// GET /api/whatsapp/logs — Returns recent connection logs
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { whatsAppManager } = await import('@/lib/whatsapp/connection')
    // Access logs/status through getStatus which is always available
    const status = whatsAppManager.getStatus()
    const logs = Array.isArray((whatsAppManager as any).getLogs?.())
      ? (whatsAppManager as any).getLogs()
      : []
    const lastError = typeof (whatsAppManager as any).getLastError === 'function'
      ? (whatsAppManager as any).getLastError()
      : null

    return NextResponse.json({
      success: true,
      logs,
      lastError,
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
