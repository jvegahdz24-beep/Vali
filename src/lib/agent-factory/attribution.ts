// ═══════════════════════════════════════════════════════════════
// ATRIBUCIÓN DE RESULTADOS POR AGENTE IA (F2, 2026-07-20)
// Antes solo se contaban mensajes (totalMessagesSent) — imposible saber
// QUÉ agente de la fábrica realmente produce citas y ventas. Ahora:
//   - citasGeneradas: se incrementa al crear una cita mientras ese agente
//     llevaba la conversación (metadata.lastAgentId del handoff F3).
//   - ventasAtribuidas: se incrementa cuando un trato pasa a GANADO y la
//     conversación del contacto tiene a ese agente como último responsable.
// El copiloto lo expone en metricas_agentes.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

/** Último agente IA que llevó la conversación más reciente del contacto. */
export async function lastAgentForContact(workspaceId: string, contactId: string): Promise<string | null> {
  const conv = await db.conversation.findFirst({
    where: { workspaceId, contactId },
    orderBy: { lastMessageAt: 'desc' },
    select: { metadata: true },
  })
  if (!conv) return null
  try {
    const meta = JSON.parse(conv.metadata || '{}') as { lastAgentId?: string }
    return meta.lastAgentId || null
  } catch { return null }
}

export async function attributeAppointmentToAgent(workspaceId: string, agentId: string | null | undefined): Promise<void> {
  if (!agentId) return
  try {
    await db.agentInstance.update({ where: { id: agentId }, data: { citasGeneradas: { increment: 1 } } })
    console.log(`[AgentFactory] Cita atribuida al agente ${agentId}`)
  } catch { /* el agente pudo ser borrado — no crítico */ }
}

export async function attributeSaleToAgent(workspaceId: string, contactId: string): Promise<void> {
  const agentId = await lastAgentForContact(workspaceId, contactId)
  if (!agentId) return
  try {
    await db.agentInstance.update({ where: { id: agentId }, data: { ventasAtribuidas: { increment: 1 } } })
    console.log(`[AgentFactory] Venta atribuida al agente ${agentId} (contacto ${contactId})`)
  } catch { /* no crítico */ }
}
