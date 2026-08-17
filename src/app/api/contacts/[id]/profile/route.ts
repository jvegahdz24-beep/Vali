// ═══════════════════════════════════════════════════════════════
// Expediente consolidado para el panel de la bandeja.
// GET /api/contacts/[id]/profile?workspaceId=...
// Junta en UNA llamada lo que ya existe disperso:
//   • Contact (básicos + score/temperatura)
//   • LeadProfile (arquetipo, presupuesto, producto, objeción, señales)
//   • Próxima cita pendiente (Appointment)
//   • Resumen de documentos del expediente
// No inventa KYC/consentimiento (esos campos no existen en el modelo).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { getExpedienteSummary } from '@/lib/erp/expediente'
import { getTimeline } from '@/lib/erp/bitacora'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const workspaceId = new URL(req.url).searchParams.get('workspaceId') ?? ''
    await requireWorkspace(workspaceId, session.userId)

    const contact = await db.contact.findFirst({
      where: { id, workspaceId },
      select: {
        id: true, firstName: true, lastName: true, phone: true, email: true,
        source: true, leadScore: true, temperature: true, tags: true, avatar: true,
        notes: true, createdAt: true, lastMessageAt: true,
      },
    })
    if (!contact) {
      return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
    }

    const [profile, nextAppointment, expediente, timeline, conversations, deals] = await Promise.all([
      db.leadProfile.findUnique({ where: { contactId: id } }),
      db.appointment.findFirst({
        where: { contactId: id, workspaceId, status: 'pending', date: { gte: new Date() } },
        orderBy: { date: 'asc' },
        select: { date: true, title: true, type: true, status: true },
      }),
      getExpedienteSummary(workspaceId, id).catch(() => null),
      getTimeline(workspaceId, id, { limit: 200, order: 'desc' }),
      db.conversation.findMany({ where: { contactId: id, workspaceId }, select: { id: true } }),
      db.deal.findMany({
        where: { contactId: id, workspaceId },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        select: {
          id: true, title: true, value: true, currency: true, status: true, assignedTo: true, updatedAt: true,
          stage: { select: { name: true, color: true, probability: true, isWon: true, isLost: true } },
        },
      }).catch(() => []),
    ])

    // Mensajes recientes (interacciones) — de las conversaciones del contacto
    const convIds = conversations.map((c) => c.id)
    let recentMessages: Array<{ id: string; content: string; type: string; direction: string; senderType: string; isAiGenerated: boolean; createdAt: Date }> = []
    let activity: { d: string; n: number }[] = []
    if (convIds.length > 0) {
      recentMessages = await db.message.findMany({
        where: { conversationId: { in: convIds } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, content: true, type: true, direction: true, senderType: true, isAiGenerated: true, createdAt: true },
      }).catch(() => [])

      // Actividad (mensajes/día últimos 14 días) para el sparkline del score
      const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - 13)
      const msgs = await db.message.findMany({
        where: { conversationId: { in: convIds }, createdAt: { gte: since } },
        select: { createdAt: true },
      }).catch(() => [])
      const buckets: Record<string, number> = {}
      for (let i = 0; i < 14; i++) { const day = new Date(since.getTime() + i * 86400000); buckets[day.toISOString().slice(0, 10)] = 0 }
      for (const m of msgs) { const k = m.createdAt.toISOString().slice(0, 10); if (k in buckets) buckets[k]++ }
      activity = Object.keys(buckets).sort().map((k) => ({ d: k.slice(8), n: buckets[k] }))
    }

    // Resolver nombres de los responsables de los deals (assignedTo = userId)
    const assigneeIds = Array.from(new Set(deals.map((d) => d.assignedTo).filter(Boolean))) as string[]
    const users = assigneeIds.length > 0
      ? await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true, email: true } }).catch(() => [])
      : []
    const userMap = new Map(users.map((u) => [u.id, u.name || u.email]))
    const dealsOut = deals.map((d) => ({
      id: d.id, title: d.title, value: d.value, currency: d.currency, status: d.status,
      stageName: d.stage?.name || null, stageColor: d.stage?.color || null,
      probability: d.stage?.probability ?? null, isWon: d.stage?.isWon || false, isLost: d.stage?.isLost || false,
      assignedToName: d.assignedTo ? (userMap.get(d.assignedTo) || null) : null,
      updatedAt: d.updatedAt,
    }))

    return NextResponse.json({ success: true, contact, profile, nextAppointment, expediente, timeline, recentMessages, deals: dealsOut, activity })
  } catch (error) {
    return errorResponse(error)
  }
}
