// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Diagnostic Endpoint
// GET /api/whatsapp/diagnostic — Shows real-time connection state
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session' }, { status: 400 })
    }

    const { tryGetWhatsAppManager, whatsAppRegistry } = await import('@/lib/whatsapp/connection')
    const manager = tryGetWhatsAppManager(session.workspaceId)
    const status = manager
      ? manager.getStatus()
      : { workspaceId: session.workspaceId, connected: false, connecting: false, qrCode: null, phone: null, lastActivity: null }

    return NextResponse.json({
      status,
      workspaceId: session.workspaceId,
      totalConnectedWorkspaces: whatsAppRegistry.all().filter((m) => m.isConnected()).length,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
