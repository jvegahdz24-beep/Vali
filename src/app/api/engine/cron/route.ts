// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Engine Cron API
// GET/POST /api/engine/cron — Trigger autonomous engine processes
// Requires CRON_SECRET header for security
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import {
  processExpiredActions,
  detectNoResponseOutcomes,
} from '@/lib/engine/auto-actions'

async function runEngineCron() {
  let expiredActions = 0
  let noResponseDetected = 0

  expiredActions = await processExpiredActions()
  noResponseDetected = await detectNoResponseOutcomes()

  return {
    success: true,
    message: 'Engine cron executed',
    timestamp: new Date().toISOString(),
    expiredActions,
    noResponseDetected,
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth: require session OR valid CRON_SECRET
    const cronSecret = request.headers.get('x-cron-secret')
    if (!cronSecret) {
      await requireAuth(request)
    } else {
      const expectedSecret = process.env.CRON_SECRET
      if (!expectedSecret) {
        return NextResponse.json(
          { success: false, error: 'CRON_SECRET not configured' },
          { status: 500 }
        )
      }
      if (cronSecret !== expectedSecret) {
        return NextResponse.json(
          { success: false, error: 'Invalid cron secret' },
          { status: 403 }
        )
      }
    }

    const result = await runEngineCron()
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Engine Cron Error]', message)
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }
}

// Also allow GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request)
}
