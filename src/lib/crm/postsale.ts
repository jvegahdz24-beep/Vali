// ═══════════════════════════════════════════════════════════════
// POSTVENTA + REFERIDOS (2026-07-20) — el ciclo ya no muere en
// "Cerrado Ganado": al ganar un trato se agenda la secuencia postventa:
//   +7d   check-in de entrega (¿todo bien con tu auto?)
//   +30d  REFERIDOS (¿conoces a alguien buscando auto?) + reseña Google
//   +180d recordatorio de servicio
//   +365d aniversario de compra
// Cada cliente feliz = fuente de leads sin costo de adquisición.
// Las tareas llevan ruleId 'post-sale' y están EXENTAS del freno anti-spam
// y del paro "ya es cliente" (su público ES el cliente); sí respetan
// aiDisabled, pausas y noqualify. Sin metadata.step → no entran a la
// escalera de ventas. Los mensajes los redacta la IA por metadata.tipo.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'

export const POST_SALE_RULE_ID = 'post-sale'

const STEPS: { days: number; tipo: string; label: string }[] = [
  { days: 7, tipo: 'postventa_checkin', label: '+7d — ¿cómo va todo con tu auto?' },
  { days: 30, tipo: 'postventa_referidos', label: '+30d — referidos + reseña' },
  { days: 180, tipo: 'postventa_servicio', label: '+180d — recordatorio de servicio' },
  { days: 365, tipo: 'postventa_aniversario', label: '+365d — aniversario de compra' },
]

export async function schedulePostSale(opts: {
  workspaceId: string
  contactId: string
  dealTitle?: string
}): Promise<number> {
  const { workspaceId, contactId } = opts
  try {
    // Config: se puede apagar por workspace con settings.postSale = false
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
    if (s.postSale === false) return 0

    // Dedup: si ya tiene postventa pendiente (otra venta reciente), no duplicar.
    const existing = await db.followUpTask.count({
      where: { workspaceId, contactId, ruleId: POST_SALE_RULE_ID, status: 'pending' },
    })
    if (existing > 0) return 0

    const conv = await db.conversation.findFirst({
      where: { workspaceId, contactId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    })
    if (!conv) return 0

    let created = 0
    for (const st of STEPS) {
      await db.followUpTask.create({
        data: {
          workspaceId,
          ruleId: POST_SALE_RULE_ID,
          contactId,
          conversationId: conv.id,
          status: 'pending',
          scheduledAt: new Date(Date.now() + st.days * 86400000),
          metadata: JSON.stringify({ tipo: st.tipo, label: st.label, postSale: true, dealTitle: opts.dealTitle || null }),
        },
      })
      created++
    }
    console.log(`[PostSale] ${created} toques de postventa agendados para contacto ${contactId} (7d/30d/180d/365d)`)
    return created
  } catch (err) {
    console.warn('[PostSale] non-critical:', (err as Error).message)
    return 0
  }
}
