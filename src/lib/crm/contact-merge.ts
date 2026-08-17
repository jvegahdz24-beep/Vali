// ═══════════════════════════════════════════════════════════════
// UNIFICACIÓN DE PERFILES MULTI-CANAL (capa de deduplicación).
// Si el cliente escribe por Instagram/Messenger/Telegram/Web y comparte el
// MISMO teléfono o correo que un contacto ya existente (p.ej. su WhatsApp),
// los perfiles se FUSIONAN en un solo Expediente del Lead: conversaciones,
// tratos, citas y bitácora se mueven al contacto original; el duplicado queda
// archivado con la referencia. Conservador: solo evidencia EXACTA (mismo
// teléfono normalizado a 10 dígitos o mismo correo) y UN solo candidato.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logTimelineEvent } from '@/lib/erp/bitacora'

/** Últimos 10 dígitos (formato MX): iguala 52/521/+52 y espacios/guiones. */
function phoneKey(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', messenger: 'Facebook',
  telegram: 'Telegram', webchat: 'Chat Web',
}

export async function maybeUnifyContact(params: {
  workspaceId: string
  contactId: string
  /** canal de la conversación actual (para el mensaje de bitácora) */
  channel?: string
  /** teléfono que el cliente DIJO en el chat (para contactos cuya identidad
   *  de canal no es un teléfono real: tg:<id>, PSID de IG/FB, webchat) */
  statedPhone?: string
}): Promise<{ merged: boolean; targetId?: string; targetName?: string }> {
  try {
    const source = await db.contact.findUnique({ where: { id: params.contactId } })
    if (!source || source.status === 'archived') return { merged: false }
    let cf: Record<string, unknown> = {}
    try { cf = JSON.parse(source.customFields || '{}') } catch { /* */ }
    if (cf.mergedInto) return { merged: false } // ya fusionado

    const pk = phoneKey(params.statedPhone) || phoneKey(source.phone)
    const email = (source.email || '').trim().toLowerCase()

    // Candidatos: mismo teléfono (10 dígitos) o mismo correo, en el MISMO workspace
    const others = await db.contact.findMany({
      where: { workspaceId: params.workspaceId, id: { not: source.id }, status: { not: 'archived' } },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, tags: true, leadScore: true, createdAt: true, customFields: true },
    })
    const matches = others.filter((o) => {
      const samePhone = pk && phoneKey(o.phone) === pk
      const sameEmail = email && (o.email || '').trim().toLowerCase() === email
      return samePhone || sameEmail
    })
    if (matches.length !== 1) return { merged: false } // 0 o ambiguo → no tocar

    const cand = matches[0]
    const matchReason = pk && phoneKey(cand.phone) === pk ? 'teléfono' : 'correo'
    // El TARGET es el contacto MÁS ANTIGUO (tiene el historial); el más nuevo se fusiona en él.
    const [target, dying] = cand.createdAt <= source.createdAt ? [cand, source] : [source, cand]
    if (dying.id === target.id) return { merged: false }

    // Mover TODO el rastro del duplicado al contacto principal
    await db.conversation.updateMany({ where: { contactId: dying.id }, data: { contactId: target.id } })
    await db.deal.updateMany({ where: { contactId: dying.id }, data: { contactId: target.id } }).catch(() => {})
    await db.appointment.updateMany({ where: { contactId: dying.id }, data: { contactId: target.id } }).catch(() => {})
    await db.contactTimelineEvent.updateMany({ where: { contactId: dying.id }, data: { contactId: target.id } }).catch(() => {})
    await db.followUpTask.updateMany({ where: { contactId: dying.id }, data: { contactId: target.id } }).catch(() => {})
    // LeadProfile es 1:1 — si el principal no tiene, hereda el del duplicado
    const targetProfile = await db.leadProfile.findUnique({ where: { contactId: target.id } }).catch(() => null)
    if (!targetProfile) {
      await db.leadProfile.updateMany({ where: { contactId: dying.id } , data: { contactId: target.id } }).catch(() => {})
    } else {
      await db.leadProfile.deleteMany({ where: { contactId: dying.id } }).catch(() => {})
    }

    // Completar datos faltantes del principal + unir etiquetas + score más alto
    const tFull = await db.contact.findUnique({ where: { id: target.id } })
    const dFull = await db.contact.findUnique({ where: { id: dying.id } })
    if (tFull && dFull) {
      const parseTags = (s: string | null) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] } }
      const tags = Array.from(new Set([...parseTags(tFull.tags), ...parseTags(dFull.tags)]))
      await db.contact.update({
        where: { id: target.id },
        data: {
          email: tFull.email || dFull.email,
          phone: (phoneKey(tFull.phone) ? tFull.phone : null) || dFull.phone || tFull.phone,
          lastName: tFull.lastName || dFull.lastName,
          tags: JSON.stringify(tags),
          leadScore: Math.max(tFull.leadScore, dFull.leadScore),
          lastMessageAt: new Date(),
        },
      })
    }

    // Archivar el duplicado con la referencia (reversible a mano)
    let dyingCF: Record<string, unknown> = {}
    try { dyingCF = JSON.parse(dFull?.customFields || '{}') } catch { /* */ }
    dyingCF.mergedInto = target.id
    dyingCF.mergedAt = new Date().toISOString()
    await db.contact.update({ where: { id: dying.id }, data: { status: 'archived', customFields: JSON.stringify(dyingCF) } })

    const chLabel = CHANNEL_LABEL[params.channel || ''] || params.channel || 'otro canal'
    const targetName = `${tFull?.firstName ?? ''} ${tFull?.lastName ?? ''}`.trim()
    await logTimelineEvent({
      workspaceId: params.workspaceId, contactId: target.id, type: 'milestone',
      title: `🔗 Perfiles unificados: es la misma persona que escribió por ${chLabel}`,
      detail: `Se detectó el mismo ${matchReason} en dos canales y se fusionaron los expedientes (conversaciones, tratos, citas y bitácora en uno solo).`,
      dedupeKey: `merge-${dying.id}-${target.id}`,
      source: 'system', importance: 'high',
    }).catch(() => {})

    console.log(`[ContactMerge] 🔗 ${dying.id} fusionado en ${target.id} (${targetName}) — canal ${chLabel}`)
    return { merged: true, targetId: target.id, targetName }
  } catch (e) {
    console.warn('[ContactMerge] error (no crítico):', e instanceof Error ? e.message : e)
    return { merged: false }
  }
}
