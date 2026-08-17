// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Engine Cron API
// GET/POST /api/engine/cron — Trigger autonomous engine processes
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import {
  processExpiredActions,
  detectNoResponseOutcomes,
} from '@/lib/engine/auto-actions'

// SEC-001: Validate CRON_SECRET to prevent unauthorized cron triggers
function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true

  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Engine Cron] CRON_SECRET not configured — access denied')
    return false
  }

  const authHeader = req.headers.get('authorization')
  const cronHeader = req.headers.get('x-cron-secret')
  return authHeader === `Bearer ${secret}` || cronHeader === secret
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let expiredActions = 0
    let noResponseDetected = 0

    expiredActions = await processExpiredActions()
    noResponseDetected = await detectNoResponseOutcomes()

    return NextResponse.json({
      success: true,
      message: 'Engine cron executed',
      timestamp: new Date().toISOString(),
      expiredActions,
      noResponseDetected,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Engine Cron Error]', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

// Also allow GET for easy testing
export async function GET(req: NextRequest) {
  return POST(req)
}
