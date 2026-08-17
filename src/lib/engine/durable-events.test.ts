import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createEngineEvent } = vi.hoisted(() => ({
  createEngineEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    engineEvent: {
      create: createEngineEvent,
    },
  },
}))

import { persistDealStageChangedEvent } from './durable-events'

describe('persistDealStageChangedEvent', () => {
  beforeEach(() => {
    createEngineEvent.mockReset()
    createEngineEvent.mockResolvedValue({ id: 'engine-event-1' })
  })

  it('persists the durable event with the real contact and stage metadata', async () => {
    await expect(persistDealStageChangedEvent({
      dealId: 'deal-1',
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      fromStageId: 'stage-a',
      toStageId: 'stage-b',
      toStageName: 'Negociación',
      value: '25000',
    })).resolves.toBe('engine-event-1')

    expect(createEngineEvent).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        type: 'DEAL_STAGE_CHANGED',
        subType: 'Negociación',
      }),
      select: { id: true },
    }))

    const call = createEngineEvent.mock.calls[0][0]
    expect(JSON.parse(call.data.metadata)).toMatchObject({
      eventType: 'deal.stage_changed',
      dealId: 'deal-1',
      toStageId: 'stage-b',
    })
  })

  it('uses the deal id only as a technical contact key when no contact exists', async () => {
    await persistDealStageChangedEvent({
      dealId: 'deal-without-contact',
      workspaceId: 'workspace-1',
      contactId: null,
      toStageId: 'stage-b',
    })

    expect(createEngineEvent.mock.calls[0][0].data.contactId).toBe('deal-without-contact')
    expect(JSON.parse(createEngineEvent.mock.calls[0][0].data.metadata).contactId).toBeNull()
  })
})
