import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    followUpTask: {
      updateMany: mocks.updateMany,
      findMany: mocks.findMany,
    },
  },
}))

import {
  claimPendingFollowUpTask,
  recoverStuckProcessingFollowUps,
  PROCESSING_TTL_MS,
} from '@/lib/followups/task-claim'

describe('follow-up task claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows only one concurrent worker to claim a pending task', async () => {
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const now = new Date('2026-08-17T12:00:00.000Z')
    const claims = await Promise.all([
      claimPendingFollowUpTask('task-1', '{"ruleId":"first"}', now),
      claimPendingFollowUpTask('task-1', '{"ruleId":"second"}', now),
    ])

    expect(claims.sort()).toEqual([false, true])
    expect(mocks.updateMany).toHaveBeenCalledTimes(2)
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'task-1', status: 'pending' },
      data: expect.objectContaining({ status: 'processing' }),
    }))
  })

  it('recovers processing tasks whose lease exceeded the TTL', async () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    mocks.findMany.mockResolvedValue([
      {
        id: 'stuck-task',
        metadata: JSON.stringify({ processingStartedAt: new Date(now.getTime() - PROCESSING_TTL_MS - 1).toISOString() }),
      },
      {
        id: 'fresh-task',
        metadata: JSON.stringify({ processingStartedAt: new Date(now.getTime() - 1_000).toISOString() }),
      },
    ])
    mocks.updateMany.mockResolvedValue({ count: 1 })

    const recovered = await recoverStuckProcessingFollowUps(now)

    expect(recovered).toBe(1)
    expect(mocks.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'stuck-task', status: 'processing' },
      data: { status: 'pending', error: 'Recovered after processing lease expired' },
    })
  })
})
