// ═══════════════════════════════════════════════════════════════
// Temporizador de aprobaciones por Telegram (pedido del cliente 2026-07-02):
// si un borrador de seguimiento (status 'awaiting_approval') no se aprueba
// ni se descarta en N horas (default 3), se ENVÍA AUTOMÁTICAMENTE.
// Salvaguardas antes del auto-envío:
//   - si el cliente RESPONDIÓ después de pedir la aprobación → se descarta
//     (el seguimiento ya no aplica; la conversación siguió sola)
//   - si la IA quedó desactivada para el contacto → se descarta
//   - sin borrador/teléfono o WhatsApp desconectado → se pospone/descarta
// Lo invocan los crons (automations cada 5 min y follow-ups cada 2h).
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { broadcastToWorkspace } from '@/lib/telegram'
import { processExpiredMarketingDrafts } from '@/lib/marketing/approval'

export const APPROVAL_TIMEOUT_HOURS_DEFAULT = 3

export async function processExpiredApprovals(): Promise<{ sent: number; cancelled: number; marketingPublished: number }> {
  let sent = 0, cancelled = 0
  // Borradores de MARKETING expirados (publicaciones del piloto)
  const mk = await processExpiredMarketingDrafts(APPROVAL_TIMEOUT_HOURS_DEFAULT).catch(() => ({ published: 0 }))
  // Todas las tareas esperando aprobación (el timestamp vive en metadata.approvalRequestedAt)
  const waiting = await db.followUpTask.findMany({
    where: { status: 'awaiting_approval' },
    take: 30,
    select: { id: true, workspaceId: true, contactId: true, conversationId: true, metadata: true, createdAt: true },
  })
  if (!waiting.length) return { sent, cancelled, marketingPublished: mk.published }

  const timeoutByWs = new Map<string, number>()
  const timeoutFor = async (wsId: string): Promise<number> => {
    if (!timeoutByWs.has(wsId)) {
      let h = APPROVAL_TIMEOUT_HOURS_DEFAULT
      try {
        const ws = await db.workspace.findUnique({ where: { id: wsId }, select: { settings: true } })
        const v = JSON.parse(ws?.settings || '{}').followUpApprovalTimeoutHours
        if (typeof v === 'number' && v >= 1 && v <= 72) h = v
      } catch { /* default */ }
      timeoutByWs.set(wsId, h)
    }
    return timeoutByWs.get(wsId)!
  }

  for (const task of waiting) {
    try {
      let meta: { draft?: string; approvalRequestedAt?: string } = {}
      try { meta = JSON.parse(task.metadata || '{}') } catch { /* ignore */ }
      const requestedAt = meta.approvalRequestedAt ? new Date(meta.approvalRequestedAt) : task.createdAt
      const hours = await timeoutFor(task.workspaceId)
      if (Date.now() - requestedAt.getTime() < hours * 3600000) continue // aún no expira

      const draft = String(meta.draft || '').trim()
      const contact = await db.contact.findUnique({
        where: { id: task.contactId },
        select: { firstName: true, lastName: true, phone: true, customFields: true },
      })
      const who = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'el cliente'

      // Salvaguarda 1: el cliente ya respondió después del borrador → descartar
      const replied = await db.message.findFirst({
        where: { conversation: { contactId: task.contactId }, direction: 'inbound', createdAt: { gt: requestedAt } },
        select: { id: true },
      })
      // Salvaguarda 2: IA desactivada para el contacto
      let aiOff = false
      try { aiOff = JSON.parse(contact?.customFields || '{}').aiDisabled === true } catch { /* ok */ }

      if (replied || aiOff || !draft || !contact?.phone) {
        await db.followUpTask.update({
          where: { id: task.id },
          data: { status: 'cancelled', error: replied ? 'expiró: el cliente ya respondió' : aiOff ? 'expiró: IA desactivada' : 'expiró: sin borrador/teléfono' },
        })
        cancelled++
        if (replied) await broadcastToWorkspace(task.workspaceId, `🕒 Borrador para <b>${who}</b> descartado automáticamente: el cliente ya respondió por su cuenta.`).catch(() => {})
        continue
      }

      const mgr = getWhatsAppManager(task.workspaceId)
      if (!mgr.isConnected()) continue // reintenta en el próximo ciclo

      const res = await mgr.sendMessage(contact.phone, draft)
      if (!res?.success) continue // reintenta después

      await db.followUpTask.update({ where: { id: task.id }, data: { status: 'sent', sentAt: new Date() } })
      await db.message.create({
        data: {
          conversationId: task.conversationId, content: draft, type: 'text', direction: 'outbound',
          senderType: 'agent', isAiGenerated: true, status: 'sent',
          metadata: JSON.stringify({ type: 'cron_follow_up', taskId: task.id, approvedVia: 'timeout' }),
        },
      }).catch(() => null)
      await db.conversation.update({
        where: { id: task.conversationId },
        data: { lastMessageAt: new Date(), lastMessagePreview: draft.slice(0, 100) },
      }).catch(() => {})
      await broadcastToWorkspace(task.workspaceId, `🕒 <b>Enviado automáticamente</b> (sin respuesta en ${hours}h) — ${who}:\n\n<i>${draft.slice(0, 300)}</i>`).catch(() => {})
      sent++
      console.log(`[ApprovalTimeout] auto-enviado tras ${hours}h: task ${task.id} → ${who}`)
    } catch (e) {
      console.warn('[ApprovalTimeout] error en task', task.id, e instanceof Error ? e.message : e)
    }
  }
  return { sent, cancelled, marketingPublished: mk.published }
}
