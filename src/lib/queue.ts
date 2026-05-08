// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v5.2.0 — BullMQ Queue System
// Persistent job queues over Redis Streams:
//   - Follow-up messages (scheduled, retryable)
//   - Event processing (async, with DLQ)
//   - AI tasks (embedding generation, batch analysis)
//   - Sync jobs (contact import, calendar sync)
//   - Notification delivery (multi-channel)
// ═══════════════════════════════════════════════════════════════

import { Queue, Worker, JobsOptions, Job } from 'bullmq'
import { config } from '@/lib/config'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'

// ─── Queue Names ─────────────────────────────────────────────

export const QUEUE_NAMES = {
  FOLLOWUPS: 'followups',
  EVENTS: 'events',
  AI_TASKS: 'ai-tasks',
  SYNC: 'sync',
  NOTIFICATIONS: 'notifications',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

/**
 * All queue name strings — useful for iterating or validation.
 */
export const ALL_QUEUE_NAMES: readonly string[] = Object.values(QUEUE_NAMES)

// ─── Default Job Options ─────────────────────────────────────

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
}

// ─── Connection ──────────────────────────────────────────────
// BullMQ creates its own ioredis connections internally for
// each Queue and Worker.  We pass the Redis URL string — BullMQ
// forwards it to ioredis which accepts it natively.
// Note: TypeScript types don't expose the string overload, but
// ioredis new Redis(url) works at runtime.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connection = config.REDIS_URL as any

// Key prefix for BullMQ keys inside Redis.
// Defaults to the project-wide Redis prefix + 'bullmq' to avoid
// collisions with other keys the app stores.
const BULLMQ_PREFIX = `${config.REDIS_PREFIX}bullmq`

// ─── Queue Registry (lazy singleton) ─────────────────────────

const queues = new Map<QueueName, Queue>()

function createQueue(name: QueueName): Queue {
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    prefix: BULLMQ_PREFIX,
  })

  queue.on('error', (err) => {
    logError('SYSTEM', `${name}_queue_error`, err)
  })

  return queue
}

/**
 * Get or create a queue by name.
 * Queues are lazily created and cached in memory.
 */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name)
  if (!queue) {
    queue = createQueue(name)
    queues.set(name, queue)
    logOk('SYSTEM', 'queue_created', { name, prefix: BULLMQ_PREFIX })
  }
  return queue
}

/**
 * Ensure every registered queue is instantiated and return all of them.
 */
export function getAllQueues(): Queue[] {
  for (const name of Object.values(QUEUE_NAMES) as QueueName[]) {
    getQueue(name)
  }
  return [...queues.values()]
}

/**
 * Add a job to the specified queue.
 *
 * @param name   The target queue name.
 * @param data   The job payload (serialisable).
 * @param opts   Override the default job options (attempts, delay, etc.).
 * @returns      The BullMQ job ID (string).
 */
export async function queueJob(
  name: QueueName,
  data: unknown,
  opts?: JobsOptions,
): Promise<string> {
  const queue = getQueue(name)
  const job = await queue.add(name, data, opts)
  if (!job.id) {
    logWarn('SYSTEM', 'job_added_without_id', { queue: name })
    return ''
  }
  logOk('SYSTEM', 'job_added', {
    queue: name,
    jobId: job.id,
    ...(opts?.delay ? { delayMs: opts.delay } : {}),
  })
  return job.id
}

/**
 * Schedule a delayed job (convenience wrapper around `queueJob`).
 */
export async function scheduleJob(
  name: QueueName,
  data: unknown,
  runAt: Date,
  opts?: JobsOptions,
): Promise<string> {
  const delay = Math.max(0, runAt.getTime() - Date.now())
  return queueJob(name, data, { ...opts, delay })
}

/**
 * Gracefully close all queues and release their Redis connections.
 * Call this on server shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  const names = [...queues.keys()]
  if (names.length === 0) return

  await Promise.allSettled(
    [...queues.values()].map((q) =>
      q.close().catch((err) => {
        logError('SYSTEM', 'close_error', err)
      }),
    ),
  )
  queues.clear()
  logOk('SYSTEM', 'all_queues_closed', { queues: names })
}

/**
 * Create a BullMQ Worker that processes jobs from the given queue.
 *
 * BullMQ opens its own dedicated ioredis connections for every Worker,
 * separate from the Queue connections and the app-wide Redis singleton.
 *
 * @param name       The queue name this worker consumes from.
 * @param processor  Async function that processes each `Job`.
 * @param opts       Concurrency, autorun flag, and per-queue overrides.
 */
export function createWorker<T = unknown>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<unknown>,
  opts?: {
    concurrency?: number
    autorun?: boolean
    prefix?: string
  },
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection,
    concurrency: opts?.concurrency ?? 5,
    autorun: opts?.autorun ?? true,
    prefix: opts?.prefix ?? BULLMQ_PREFIX,
  })

  // ── Lifecycle event logging ──

  worker.on('completed', (job: Job<T>) => {
    const duration =
      job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : undefined
    logOk('SYSTEM', `${name}_completed`, {
      jobId: job.id,
      ...(duration ? { durationMs: duration } : {}),
    })
  })

  worker.on('failed', (job: Job<T> | undefined, err: Error) => {
    logError('SYSTEM', `${name}_failed`, err, {
      jobId: job?.id ?? 'unknown',
      attemptsMade: job?.attemptsMade ?? 0,
      willRetry: job?.attemptsMade !== undefined
        ? job.attemptsMade < (job.opts?.attempts ?? 3)
        : false,
    })
  })

  worker.on('error', (err: Error) => {
    logError('SYSTEM', `${name}_error`, err)
  })

  worker.on('ready', () => {
    logOk('SYSTEM', `${name}_ready`, {
      concurrency: opts?.concurrency ?? 5,
    })
  })

  worker.on('closing', () => {
    logInfo('SYSTEM', `${name}_closing`, {})
  })

  worker.on('closed', () => {
    logInfo('SYSTEM', `${name}_closed`, {})
  })

  return worker
}

/**
 * Get queue health counts (waiting, active, completed, failed, delayed).
 */
export async function getQueueCounts(
  name: QueueName,
): Promise<{
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}> {
  const queue = getQueue(name)
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])
  return { waiting, active, completed, failed, delayed }
}

/**
 * Get counts for ALL registered queues in one call.
 */
export async function getAllQueueCounts(): Promise<
  Record<QueueName, Awaited<ReturnType<typeof getQueueCounts>>>
> {
  const entries = (Object.values(QUEUE_NAMES) as QueueName[]).map(
    async (name) => [name, await getQueueCounts(name)] as const,
  )
  const results = await Promise.all(entries)
  return Object.fromEntries(results) as Record<
    QueueName,
    Awaited<ReturnType<typeof getQueueCounts>>
  >
}

/**
 * Drain a queue — remove all pending / waiting jobs.
 * Useful for maintenance or testing cleanup.
 */
export async function drainQueue(name: QueueName): Promise<void> {
  const queue = getQueue(name)
  await queue.drain()
  logWarn('SYSTEM', `${name}_drained`, {})
}

/**
 * Obliterate a queue — removes ALL keys associated with the queue.
 * Destructive: completed / failed jobs are also deleted.
 */
export async function obliterateQueue(name: QueueName): Promise<void> {
  const queue = getQueue(name)
  await queue.obliterate({ force: true })
  queues.delete(name)
  logWarn('SYSTEM', `${name}_obliterated`, {})
}
