// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Engine Cron API
// GET/POST /api/engine/cron — Trigger autonomous engine processes
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import {
  processExpiredActions,
  detectNoResponseOutcomes,
} from '@/lib/engine/auto-actions'
import { ApiError } from '@/lib/api-auth'

function verifyCronAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // If CRON_SECRET is configured, require Bearer token auth
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      throw new ApiError(401, 'Invalid or missing cron secret')
    }
  }
  // If no CRON_SECRET configured, allow (dev mode — production should set CRON_SECRET)
}

export async function POST(request: NextRequest) {
  try {
    verifyCronAuth(request)

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
    if (error instanceof ApiError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode })
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Engine Cron Error]', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

// Also allow GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request)
}
