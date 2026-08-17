// ═══════════════════════════════════════════════════════════════
// Difusión manual de WhatsApp — POST /api/broadcast
// { workspaceId, contactIds[], message, immediate? }
// - immediate=true (1 contacto): envía YA (ej. cotización desde el Tablero).
// - varios contactos: ENCOLA un envío cada 2 minutos (anti-baneo) usando la
//   cola de follow-ups (ruleId 'manual-broadcast'; el worker la procesa).
// El mensaje admite {{name}} para personalizar con el nombre del contacto.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { sendOperatorMessage } from '@/lib/whatsapp/operator-send'
import { sendToLead } from '@/lib/marketing/lead-channel'
import { randomUUID } from 'crypto'

const SPACING_MS = 2 * 60 * 1000 // 2 minutos entre mensajes
const isTg = (p: string | null | undefined) => (p || '').startsWith('tg:')

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId?: string; contactIds?: string[]; message?: string; immediate?: boolean; channel?: string; campaignName?: string }
    const workspaceId = body.workspaceId || ''
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const message = String(body.message || '').trim()
    const ids = Array.isArray(body.contactIds) ? [...new Set(body.contactIds.map(String))].slice(0, 200) : []
    if (!message) throw new ApiError(400, 'Escribe el mensaje a enviar')
    if (!ids.length) throw new ApiError(400, 'Selecciona al menos un contacto')

    // Canal explícito (contrato §Pantalla 5): auto = por canal preferido de cada
    // lead; whatsapp/telegram = solo los alcanzables por ese canal.
    const channel = ['auto', 'whatsapp', 'telegram'].includes(String(body.channel)) ? String(body.channel) : 'auto'
    const campaignName = String(body.campaignName || 'Difusión').trim().slice(0, 80) || 'Difusión'
    const campaignId = randomUUID()

    const contacts = await db.contact.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true, customFields: true } })
    let withPhone = contacts.filter((c) => c.phone)
    if (channel === 'whatsapp') withPhone = withPhone.filter((c) => !isTg(c.phone))
    else if (channel === 'telegram') withPhone = withPhone.filter((c) => isTg(c.phone))
    if (!withPhone.length) throw new ApiError(400, channel === 'auto' ? 'Ninguno de los contactos seleccionados tiene teléfono' : `Ningún contacto seleccionado es alcanzable por ${channel}`)

    // Conversación por contacto (find-or-create) — la cola la necesita
    const convoOf = new Map<string, string>()
    for (const c of withPhone) {
      let convo = await db.conversation.findFirst({ where: { workspaceId, contactId: c.id }, orderBy: { lastMessageAt: 'desc' }, select: { id: true } })
      if (!convo) convo = await db.conversation.create({ data: { workspaceId, contactId: c.id, channel: isTg(c.phone) ? 'telegram' : 'whatsapp', status: 'active' }, select: { id: true } })
      convoOf.set(c.id, convo.id)
    }

    // ── Envío INMEDIATO (un contacto): cotizaciones y mensajes directos ──
    if (body.immediate && withPhone.length === 1) {
      const c = withPhone[0]
      const personalized = message.replace(/\{\{name\}\}/g, c.firstName).replace(/\{\{firstName\}\}/g, c.firstName).replace(/\{\{lastName\}\}/g, c.lastName || '')
      if (isTg(c.phone)) {
        const r = await sendToLead(workspaceId, c, personalized)
        if (!r.success) throw new ApiError(502, r.error || 'No se pudo enviar por Telegram')
      } else {
        const r = await sendOperatorMessage({ workspaceId, phone: c.phone!, message: personalized, conversationId: convoOf.get(c.id)!, contactId: c.id })
        if (!r.success && !r.delivered) throw new ApiError(502, r.error || 'No se pudo enviar (¿WhatsApp conectado?)')
      }
      return Response.json({ success: true, sent: 1, queued: 0 })
    }

    // ── Cola espaciada: 1 mensaje cada 2 minutos ──
    const now = Date.now()
    await db.followUpTask.createMany({
      data: withPhone.map((c, i) => ({
        workspaceId,
        ruleId: 'manual-broadcast',
        contactId: c.id,
        conversationId: convoOf.get(c.id)!,
        status: 'pending',
        scheduledAt: new Date(now + i * SPACING_MS),
        metadata: JSON.stringify({ message, source: 'dashboard-broadcast', by: session.userId, campaignId, campaignName, channel }),
      })),
    })
    const skipped = ids.length - withPhone.length
    return Response.json({
      success: true,
      campaignId,
      campaignName,
      channel,
      queued: withPhone.length,
      skipped,
      etaMinutes: Math.ceil((withPhone.length - 1) * 2),
      note: `Se enviará 1 mensaje cada ~2 minutos (anti-baneo). Último aprox. en ${Math.ceil((withPhone.length - 1) * 2)} min.`,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
