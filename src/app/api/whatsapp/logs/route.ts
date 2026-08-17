// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Logs Endpoint
// GET /api/whatsapp/logs — Returns status for the authenticated workspace
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { tryGetWhatsAppManager } from '@/lib/whatsapp/connection'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ success: false, error: 'No workspace in session' }, { status: 400 })
    }

    const manager = tryGetWhatsAppManager(session.workspaceId)
    const status = manager
      ? manager.getStatus()
      : { workspaceId: session.workspaceId, connected: false, connecting: false, qrCode: null, phone: null, lastActivity: null }

    return NextResponse.json({
      success: true,
      logs: [],
      lastError: null,
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
