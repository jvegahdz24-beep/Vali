import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: {
    database: boolean
    memory: boolean
    uptime: number
    dbLatencyMs?: number
  } = {
    database: false,
    memory: false,
    uptime: process.uptime(),
  }

  // Check database connectivity + measure latency
  try {
    const start = performance.now()
    await db.$queryRaw`SELECT 1 as ok`
    checks.dbLatencyMs = Math.round(performance.now() - start)
    checks.database = true
  } catch (e) {
    checks.database = false
  }

  // Check memory usage (healthy if heapUsed < 1.5 GB)
  const memUsage = process.memoryUsage()
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024
  const rssMB = memUsage.rss / 1024 / 1024
  checks.memory = heapUsedMB < 1536

  const healthy = checks.database && checks.memory
  const status = healthy ? 200 : 503

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: checks.uptime,
      checks,
      memory: {
        heapUsedMB: heapUsedMB.toFixed(1),
        rssMB: rssMB.toFixed(1),
        heapLimitMB: '4096',
      },
      version: process.env.npm_package_version || '0.2.0',
      node: process.version,
    },
    { status }
  )
}
