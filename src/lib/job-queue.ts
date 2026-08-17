// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — DB-Backed Job Queue (MySQL / Prisma)
// Drop-in BullMQ replacement without Redis.
// Supports: enqueue, retry with backoff, max attempts, workspaceId scoping.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface JobPayload {
  [key: string]: unknown
}

export interface EnqueueOptions {
  workspaceId?: string
  /** Delay in milliseconds before the job becomes eligible to run */
  delayMs?: number
  maxAttempts?: number
}

/**
 * Add a job to the queue.
 */
export async function enqueue(
  type: string,
  payload: JobPayload,
  opts: EnqueueOptions = {}
): Promise<string> {
  const { workspaceId, delayMs = 0, maxAttempts = 3 } = opts
  const nextRunAt = new Date(Date.now() + delayMs)

  const job = await db.jobQueue.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      status: 'pending',
      attempts: 0,
      maxAttempts,
      nextRunAt,
      workspaceId: workspaceId ?? null,
    },
    select: { id: true },
  })

  return job.id
}

export type JobHandler<P extends JobPayload = JobPayload> = (
  payload: P,
  jobId: string
) => Promise<void>

/**
 * Poll and process pending jobs of a given type.
 * Runs until queue is drained or `maxBatch` jobs have been processed.
 *
 * @param type       Job type key (e.g. 'send_follow_up', 'score_decay')
 * @param handler    Async function that processes the job
 * @param maxBatch   Max jobs to process per call (default 20)
 */
export async function processJobs<P extends JobPayload = JobPayload>(
  type: string,
  handler: JobHandler<P>,
  maxBatch = 20
): Promise<{ processed: number; failed: number }> {
  const now = new Date()
  let processed = 0
  let failedCount = 0

  // Claim a batch atomically (set status → 'processing')
  const jobs = await db.jobQueue.findMany({
    where: {
      type,
      status: 'pending',
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: 'asc' },
    take: maxBatch,
    select: { id: true, payload: true, attempts: true, maxAttempts: true },
  })

  for (const job of jobs) {
    // Optimistic lock: update to 'processing' only if still 'pending'
    const claimed = await db.jobQueue.updateMany({
      where: { id: job.id, status: 'pending' },
      data: { status: 'processing', attempts: { increment: 1 } },
    })
    if (claimed.count === 0) continue // Another worker claimed it

    let payload: P
    try {
      payload = JSON.parse(job.payload) as P
    } catch {
      await db.jobQueue.update({
        where: { id: job.id },
        data: { status: 'failed', lastError: 'Invalid JSON payload' },
      })
      failedCount++
      continue
    }

    try {
      await handler(payload, job.id)
      await db.jobQueue.update({
        where: { id: job.id },
        data: { status: 'done' },
      })
      processed++
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      const newAttempts = job.attempts + 1
      const maxed = newAttempts >= job.maxAttempts

      if (maxed) {
        await db.jobQueue.update({
          where: { id: job.id },
          data: { status: 'failed', lastError: error },
        })
        failedCount++
      } else {
        // Exponential backoff: 1min, 5min, 25min
        const backoffMs = Math.pow(5, newAttempts) * 60 * 1000
        await db.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'pending',
            lastError: error,
            nextRunAt: new Date(Date.now() + backoffMs),
          },
        })
      }
    }
  }

  return { processed, failed: failedCount }
}

/**
 * Remove old completed/failed jobs older than `olderThanMs` (default 7 days).
 */
export async function cleanupJobs(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const result = await db.jobQueue.deleteMany({
    where: {
      status: { in: ['done', 'failed'] },
      updatedAt: { lt: cutoff },
    },
  })
  return result.count
}

/**
 * Get queue stats for monitoring.
 */
export async function getQueueStats(type?: string) {
  const where = type ? { type } : {}
  const [pending, processing, done, failed] = await Promise.all([
    db.jobQueue.count({ where: { ...where, status: 'pending' } }),
    db.jobQueue.count({ where: { ...where, status: 'processing' } }),
    db.jobQueue.count({ where: { ...where, status: 'done' } }),
    db.jobQueue.count({ where: { ...where, status: 'failed' } }),
  ])
  return { pending, processing, done, failed }
}
