import { db } from '@/lib/db'
import { EVENT_TYPES } from '@/lib/event-bus'

export interface DealStageChangedEvent {
  dealId: string
  workspaceId: string
  contactId?: string | null
  fromStageId?: string | null
  fromStageName?: string | null
  toStageId?: string | null
  toStageName?: string | null
  status?: string | null
  value?: number | string | null
}

/**
 * Persiste un cambio de etapa antes de emitir el evento en memoria.
 * EngineEvent exige contactId; para deals sin contacto usamos el dealId como
 * clave técnica y dejamos el contactId real explícito en metadata.
 */
export async function persistDealStageChangedEvent(event: DealStageChangedEvent): Promise<string> {
  const record = await db.engineEvent.create({
    data: {
      workspaceId: event.workspaceId,
      contactId: event.contactId || event.dealId,
      type: 'DEAL_STAGE_CHANGED',
      subType: event.toStageName || null,
      metadata: JSON.stringify({
        eventType: EVENT_TYPES.DEAL_STAGE_CHANGED,
        ...event,
      }),
    },
    select: { id: true },
  })

  return record.id
}
