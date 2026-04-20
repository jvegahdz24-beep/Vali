// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — WhatsApp Connection Diagnostic Endpoint
// GET /api/whatsapp/diagnostic — Shows real-time connection state
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'

export async function GET() {
  try {
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
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      singletonAlive: false,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
