// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Engine Cron API
// GET/POST /api/engine/cron — Trigger autonomous engine processes
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import {
  processExpiredActions,
  detectNoResponseOutcomes,
} from '@/lib/engine/auto-actions'

export async function POST() {
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
export async function GET() {
  return POST()
}
