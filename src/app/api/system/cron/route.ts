// ═══════════════════════════════════════════════════════════════
// API Route: POST/GET /api/system/cron
// Start, stop, and query the NEXUS cron scheduler.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { startCronScheduler, stopCronScheduler, getCronStatus } from '@/lib/cron-scheduler'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body?.action as string | undefined

    if (!action || !['start', 'stop'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing or invalid "action". Use "start" or "stop".' },
        { status: 400 },
      )
    }

    if (action === 'start') {
      startCronScheduler()
      const status = getCronStatus()
      return NextResponse.json({ ok: true, action: 'started', status })
    }

    if (action === 'stop') {
      stopCronScheduler()
      const status = getCronStatus()
      return NextResponse.json({ ok: true, action: 'stopped', status })
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid request: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    )
  }
}

export async function GET() {
  try {
    const status = getCronStatus()
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to get cron status: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }
}
