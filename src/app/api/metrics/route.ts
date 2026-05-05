// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — Prometheus Metrics Endpoint
// GET /api/metrics — Prometheus text exposition format
// Protected with Bearer token (WORKER_KEY or MEILI_MASTER_KEY)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { exportMetrics } from '@/lib/observability/metrics'
import { logWarn, logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Validate Bearer token from the Authorization header.
 * Accepts either WORKER_KEY or MEILI_MASTER_KEY.
 */
function validateBearerToken(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return false

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false

  const token = parts[1]
  if (!token) return false

  const workerKey = process.env.WORKER_KEY
  const meiliKey = process.env.MEILI_MASTER_KEY

  if (workerKey && token === workerKey) return true
  if (meiliKey && token === meiliKey) return true

  return false
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth check ─────────────────────────────────────────────
    if (!validateBearerToken(req)) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid Bearer token required (WORKER_KEY or MEILI_MASTER_KEY)',
        },
        { status: 401 }
      )
    }

    // ── Export metrics ─────────────────────────────────────────
    const metricsText = exportMetrics()

    return new NextResponse(metricsText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err) {
    logError('CORE', 'metrics_endpoint_error', err)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to export metrics' },
      { status: 500 }
    )
  }
}
