// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Diagnostic Endpoint
// GET /api/whatsapp/diagnostic — Shows real-time connection state
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)
    const { whatsAppManager } = await import('@/lib/whatsapp/connection')
    const status = whatsAppManager.getStatus()

    // Check auth directory
    let authInfo: Record<string, unknown> = {}
    try {
      const fs = await import('fs')
      const path = await import('path')
      const authDir = path.join(process.cwd(), '.whatsapp-auth')
      const credsPath = path.join(authDir, 'creds.json')
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'))
        authInfo = {
          hasCreds: true,
          registered: creds.registered,
          me: creds.me?.id || null,
          hasAdvisoryKey: !!creds.advisoryQuestionEncryptedKey,
          platform: creds.platform,
          lastSync: creds.lastAccountSyncTimestamp,
        }
      } else {
        const files = fs.existsSync(authDir) ? fs.readdirSync(authDir) : []
        authInfo = { hasCreds: false, authFiles: files.length }
      }
    } catch (e: any) {
      authInfo = { error: e.message }
    }

    return NextResponse.json({
      status,
      authInfo,
      singletonAlive: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return errorResponse(error, 'Error al obtener diagnóstico de WhatsApp')
  }
}
