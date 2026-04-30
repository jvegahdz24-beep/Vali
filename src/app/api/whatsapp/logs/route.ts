// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Logs Endpoint
// GET /api/whatsapp/logs — Returns recent connection logs
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)
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
