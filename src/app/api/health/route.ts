import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redisHealthCheck, isRedisAvailable } from '@/lib/redis'
import { bootstrapApp } from '@/lib/bootstrap'
import { logInfo, logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  bootstrapApp()

  const checks: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs?: number; error?: string }> = {}
  let overallHealthy = true

  // ── Database (PostgreSQL) ────────────────────────────────────
  try {
    const start = performance.now()
    await db.$queryRaw`SELECT 1 as ok`
    const latencyMs = Math.round(performance.now() - start)
    checks.database = { status: 'healthy', latencyMs }
  } catch (err) {
    checks.database = {
      status: 'unhealthy',
      error: err instanceof Error ? err.message : String(err),
    }
    overallHealthy = false
    logError('HEALTH', 'db_check_failed', err)
  }

  // ── Redis ────────────────────────────────────────────────────
  try {
    const redisCheck = await redisHealthCheck()
    checks.redis = redisCheck
    if (redisCheck.status === 'unhealthy') {
      overallHealthy = false
    }
  } catch {
    checks.redis = { status: 'unhealthy', latencyMs: -1, error: 'Redis not available' }
  }

  // ── Memory ───────────────────────────────────────────────────
  const memUsage = process.memoryUsage()
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024
  const rssMB = memUsage.rss / 1024 / 1024
  const memoryHealthy = heapUsedMB < 1536
  checks.memory = {
    status: memoryHealthy ? 'healthy' : 'degraded',
    ...(memoryHealthy ? {} : { error: `Heap usage ${heapUsedMB.toFixed(0)}MB exceeds 1536MB threshold` }),
  }

  // ── System ───────────────────────────────────────────────────
  checks.system = {
    status: 'healthy',
    latencyMs: 0,
  }

  const isProd = process.env.NODE_ENV === 'production'

  if (isProd) {
    const healthy = overallHealthy && memoryHealthy
    return NextResponse.json(
      { status: healthy ? 'healthy' : 'unhealthy', timestamp: new Date().toISOString() },
      { status: healthy ? 200 : 503 },
    )
  }

  return NextResponse.json(
    {
      status: overallHealthy && memoryHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '5.2.0',
      node: process.version,
      environment: process.env.NODE_ENV,
      checks,
      memory: {
        heapUsedMB: heapUsedMB.toFixed(1),
        rssMB: rssMB.toFixed(1),
        heapLimitMB: '4096',
      },
    },
    { status: overallHealthy && memoryHealthy ? 200 : 503 },
  )
}
