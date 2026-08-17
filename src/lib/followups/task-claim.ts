import { db } from '@/lib/db'

export const PROCESSING_TTL_MS = 10 * 60 * 1000
export type FollowUpMetadata = Record<string, unknown>

export function parseFollowUpMetadata(value: string | null | undefined): FollowUpMetadata {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function claimPendingFollowUpTask(
  taskId: string,
  currentMetadata: string | null,
  now = new Date(),
): Promise<boolean> {
  const result = await db.followUpTask.updateMany({
    where: { id: taskId, status: 'pending' },
    data: {
      status: 'processing',
      metadata: JSON.stringify({
        ...parseFollowUpMetadata(currentMetadata),
        processingStartedAt: now.toISOString(),
      }),
    },
  })
  return result.count > 0
}

export async function recoverStuckProcessingFollowUps(now = new Date()): Promise<number> {
  const processingTasks = await db.followUpTask.findMany({
    where: { status: 'processing' },
    select: { id: true, metadata: true },
    take: 200,
  })
  let recovered = 0

  for (const task of processingTasks) {
    const metadata = parseFollowUpMetadata(task.metadata)
    const startedAt = typeof metadata.processingStartedAt === 'string'
      ? Date.parse(metadata.processingStartedAt)
      : Number.NaN
    const isStuck = !Number.isFinite(startedAt) || now.getTime() - startedAt > PROCESSING_TTL_MS
    if (!isStuck) continue

    const result = await db.followUpTask.updateMany({
      where: { id: task.id, status: 'processing' },
      data: {
        status: 'pending',
        error: 'Recovered after processing lease expired',
      },
    })
    recovered += result.count
  }

  if (recovered > 0) {
    console.warn(`[FollowUp Worker] Recovered ${recovered} stuck processing task(s)`)
  }
  return recovered
}
