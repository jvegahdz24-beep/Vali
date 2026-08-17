import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  let dbOk = false

  try {
    await db.$queryRaw`SELECT 1 as ok`
    dbOk = true
  } catch {
    dbOk = false
  }

  const healthy = dbOk
  const status = healthy ? 200 : 503

  // SEC-005: Public response — minimal info only
  const publicResponse = {
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
  }

  // Detailed info only for internal monitoring (requires HEALTH_INTERNAL_KEY)
  const internalKey = process.env.HEALTH_INTERNAL_KEY
  const requestKey = req.headers.get('x-internal-key')

  if (internalKey && requestKey === internalKey) {
    const memUsage = process.memoryUsage()
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024
    const rssMB = memUsage.rss / 1024 / 1024
    return NextResponse.json({
      ...publicResponse,
      uptime: process.uptime(),
      checks: { database: dbOk, memory: heapUsedMB < 1536, dbLatencyMs: undefined },
      memory: {
        heapUsedMB: heapUsedMB.toFixed(1),
        rssMB: rssMB.toFixed(1),
      },
      version: process.env.npm_package_version || '0.2.0',
      node: process.version,
    }, { status })
  }

  return NextResponse.json(publicResponse, { status })
}
