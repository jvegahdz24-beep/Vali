// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Bitácora / Expediente Timeline
// La IA y el sistema van anotando, en orden cronológico, los puntos
// importantes de cada contacto: intereses, intenciones, presupuesto,
// objeciones, puntos de dolor, citas, documentos, consentimientos y
// resúmenes IA. Da historial completo y trazabilidad por contacto.
//
// Diseño: las anotaciones de SEÑALES son deterministas (sin costo de IA)
// y se deduplican contra el último evento de cada tipo, de modo que la
// bitácora actúa como un change-log (solo anota cuando algo aparece o
// cambia). El resumen en lenguaje natural lo escribe la IA cada N mensajes.
// Todas las funciones son no-bloqueantes: nunca rompen el flujo de mensajes.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'
import type { LeadProfileData } from '@/lib/ai/lead-profiler'

export type TimelineEventType =
  | 'interest'
  | 'budget'
  | 'intention'
  | 'objection'
  | 'archetype'
  | 'painpoint'
  | 'appointment'
  | 'document'
  | 'consent'
  | 'deal'
  | 'milestone'
  | 'ai_summary'
  | 'note'

export interface TimelineEventInput {
  workspaceId: string
  contactId: string
  conversationId?: string | null
  type: TimelineEventType
  title: string
  detail?: string | null
  dedupeKey?: string | null
  source?: 'ai' | 'system' | 'human'
  importance?: 'low' | 'normal' | 'high'
  metadata?: Record<string, unknown>
}

/** Inserts a single timeline event. Non-throwing. */
export async function logTimelineEvent(input: TimelineEventInput): Promise<void> {
  try {
    await db.contactTimelineEvent.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        conversationId: input.conversationId ?? null,
        type: input.type,
        title: input.title,
        detail: input.detail ?? null,
        dedupeKey: input.dedupeKey ?? null,
        source: input.source ?? 'system',
        importance: input.importance ?? 'normal',
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    })
  } catch (err) {
    console.warn('[Bitácora] logTimelineEvent failed (non-critical):', err instanceof Error ? err.message : err)
  }
}

/** Returns a contact's timeline, newest first by default. Non-throwing. */
export async function getTimeline(
  workspaceId: string,
  contactId: string,
  opts?: { limit?: number; order?: 'asc' | 'desc' },
) {
  try {
    return await db.contactTimelineEvent.findMany({
      where: { workspaceId, contactId },
      orderBy: { createdAt: opts?.order ?? 'desc' },
      take: opts?.limit ?? 200,
    })
  } catch (err) {
    console.warn('[Bitácora] getTimeline failed (non-critical):', err instanceof Error ? err.message : err)
    return []
  }
}

// ─── Human-readable label maps (Spanish) ─────────────────────

const BUDGET_LABEL: Record<string, string> = { bajo: 'bajo', medio: 'medio', alto: 'alto' }
const INTENTION_LABEL: Record<string, string> = {
  now: 'comprar ya / inmediato',
  soon: 'comprar pronto',
  later: 'comprar más adelante',
}
const OBJECTION_LABEL: Record<string, string> = {
  precio: 'precio',
  tiempo: 'no es buen momento',
  autoridad: 'decisión compartida',
  confianza: 'confianza',
  necesidad: 'necesidad',
}
const ARCHETYPE_LABEL: Record<string, string> = {
  practico: 'Práctico',
  familiar: 'Familiar',
  aspiracional: 'Aspiracional',
  estrategico: 'Estratégico',
  consciente: 'Consciente',
}
const PAINPOINT_LABEL: Record<string, string> = {
  perdida_de_tiempo: 'pierde tiempo / lentitud',
  limitacion_financiera: 'limitación financiera',
  estres_complicacion: 'estrés / complicación',
  mal_servicio: 'mal servicio previo',
  confusion_informacion: 'confusión / demasiadas opciones',
}

/**
 * Anota en la bitácora las señales NUEVAS o que CAMBIARON de un perfil recién
 * calculado. Deduplica contra el último evento de cada tipo (escalares) y
 * contra todos los valores ya anotados (arrays como pain points), de modo que
 * no genera ruido repetido. Determinista, sin costo de IA.
 */
export async function recordProfileTimeline(
  profile: LeadProfileData,
  ctx: { conversationId?: string | null },
): Promise<void> {
  try {
    const { workspaceId, contactId } = profile

    // Pull recent events once and build dedupe indexes.
    const recent = await db.contactTimelineEvent.findMany({
      where: { workspaceId, contactId },
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: { type: true, dedupeKey: true },
    })
    const latestByType = new Map<string, string | null>()
    const keysByType = new Map<string, Set<string>>()
    for (const e of recent) {
      if (!latestByType.has(e.type)) latestByType.set(e.type, e.dedupeKey ?? null)
      if (!keysByType.has(e.type)) keysByType.set(e.type, new Set())
      if (e.dedupeKey) keysByType.get(e.type)!.add(e.dedupeKey)
    }

    const toCreate: TimelineEventInput[] = []

    // ── Scalar signals: log when value differs from the latest of its type ──
    const pushScalar = (
      type: TimelineEventType,
      value: string | null | undefined,
      title: string,
      importance: 'low' | 'normal' | 'high' = 'normal',
    ) => {
      if (!value) return
      if (latestByType.get(type) === value) return // unchanged
      toCreate.push({
        workspaceId,
        contactId,
        conversationId: ctx.conversationId,
        type,
        title,
        dedupeKey: value,
        source: 'system',
        importance,
      })
    }

    if (profile.preferredProduct) {
      pushScalar('interest', profile.preferredProduct, `📌 Interés: ${profile.preferredProduct}`)
    }
    if (profile.budget) {
      pushScalar('budget', profile.budget, `💰 Presupuesto: ${BUDGET_LABEL[profile.budget] ?? profile.budget}`)
    }
    if (profile.timeline && profile.timeline !== 'none') {
      pushScalar('intention', profile.timeline, `⏱️ Intención: ${INTENTION_LABEL[profile.timeline] ?? profile.timeline}`)
    }
    if (profile.mainObjection) {
      pushScalar('objection', profile.mainObjection, `⚠️ Objeción: ${OBJECTION_LABEL[profile.mainObjection] ?? profile.mainObjection}`, 'high')
    }
    if (profile.archetype && profile.archetype !== 'desconocido') {
      pushScalar('archetype', profile.archetype, `🧠 Arquetipo: ${ARCHETYPE_LABEL[profile.archetype] ?? profile.archetype}`)
    }
    if (profile.urgencyLevel === 'high') {
      pushScalar('milestone', 'urgencia_alta', '🚨 Urgencia alta detectada', 'high')
    }

    // ── Array signals: each item is a distinct fact — log once ever ──
    const painSeen = keysByType.get('painpoint') ?? new Set<string>()
    const painPoints = Array.isArray(profile.painPoints) ? profile.painPoints : []
    for (const pp of painPoints) {
      if (!pp || painSeen.has(pp)) continue
      painSeen.add(pp)
      toCreate.push({
        workspaceId,
        contactId,
        conversationId: ctx.conversationId,
        type: 'painpoint',
        title: `❗ Punto de dolor: ${PAINPOINT_LABEL[pp] ?? pp}`,
        dedupeKey: pp,
        source: 'system',
        importance: 'high',
      })
    }

    for (const ev of toCreate) await logTimelineEvent(ev)
  } catch (err) {
    console.warn('[Bitácora] recordProfileTimeline failed (non-critical):', err instanceof Error ? err.message : err)
  }
}

/** Anota una cita agendada (deduplicada por fecha+título). */
export async function recordAppointmentTimeline(params: {
  workspaceId: string
  contactId: string
  conversationId?: string | null
  title: string
  dateISO: string
}): Promise<void> {
  const key = `${params.dateISO}|${params.title}`
  const existing = await db.contactTimelineEvent
    .findFirst({
      where: { workspaceId: params.workspaceId, contactId: params.contactId, type: 'appointment', dedupeKey: key },
      select: { id: true },
    })
    .catch(() => null)
  if (existing) return
  const when = new Date(params.dateISO).toLocaleString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })
  await logTimelineEvent({
    workspaceId: params.workspaceId,
    contactId: params.contactId,
    conversationId: params.conversationId,
    type: 'appointment',
    title: `📅 Cita agendada: ${when}`,
    detail: params.title,
    dedupeKey: key,
    source: 'system',
    importance: 'high',
  })
}

const SUMMARY_EVERY_N = 6

/**
 * Cada N mensajes del contacto, la IA escribe un resumen en lenguaje natural de
 * los puntos clave recientes (qué quiere, intención, qué lo frena). Best-effort:
 * solo corre en el múltiplo exacto y se salta si ya hay resumen para ese punto.
 */
export async function maybeWriteAiSummary(params: {
  workspaceId: string
  contactId: string
  conversationId: string
  totalMessages: number
  provider?: string
  model?: string
  tenantApiKey?: string
  everyN?: number
}): Promise<void> {
  try {
    const everyN = params.everyN ?? SUMMARY_EVERY_N
    const total = params.totalMessages
    if (total < everyN || total % everyN !== 0) return

    // Skip if we already summarized at this message count.
    const last = await db.contactTimelineEvent.findFirst({
      where: { workspaceId: params.workspaceId, contactId: params.contactId, type: 'ai_summary' },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    })
    if (last) {
      try {
        const m = JSON.parse(last.metadata || '{}')
        if (typeof m.atMessage === 'number' && m.atMessage >= total) return
      } catch { /* ignore */ }
    }

    // Build a short transcript from recent messages (contact + agent).
    const msgs = await db.message.findMany({
      where: { conversation: { id: params.conversationId } },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: { content: true, senderType: true },
    })
    msgs.reverse()
    if (msgs.length === 0) return
    const transcript = msgs
      .map((m) => `${m.senderType === 'contact' ? 'Cliente' : 'Asesor'}: ${m.content}`)
      .join('\n')
      .slice(0, 4000)

    const { content } = await chatWithAI(
      [
        {
          role: 'system',
          content:
            'Eres el auditor que escribe la bitácora del expediente de un cliente. Resume la conversación ' +
            'en máximo 3 frases, español, tercera persona, basándote SOLO en lo que el CLIENTE dijo textualmente. ' +
            'REGLAS ESTRICTAS: ' +
            '1) PROHIBIDO inventar o suponer: si un dato no aparece en el texto, no lo menciones. ' +
            '2) PROHIBIDO reinterpretar lo que pide el cliente para que encaje con lo que vende el negocio: ' +
            'si pidió algo que no se le resolvió o que el negocio no le ofreció, regístralo tal cual con sus palabras ' +
            '(ej. "pidió generación de leads antes de contratar"). ' +
            '3) Registra fielmente: qué pidió/busca el cliente, los datos duros que él dio (volúmenes, montos, rol), ' +
            'su objeción o condición si la hay, y cómo quedó la conversación (siguiente paso, o si quedó en pausa y por qué). ' +
            '4) Tono neutro de auditoría: sin adornos, sin conclusiones optimistas, sin favorecer al negocio. ' +
            'No saludes ni uses viñetas.',
        },
        { role: 'user', content: `Conversación reciente:\n${transcript}\n\nResumen para el expediente:` },
      ],
      params.provider || 'glm',
      params.model,
      { temperature: 0.3, maxTokens: 180, tenantApiKey: params.tenantApiKey, disableThinking: true },
    )

    const summary = (content || '').trim().replace(/^["“]|["”]$/g, '').slice(0, 600)
    if (!summary) return

    await logTimelineEvent({
      workspaceId: params.workspaceId,
      contactId: params.contactId,
      conversationId: params.conversationId,
      type: 'ai_summary',
      title: `🧠 Resumen IA: ${summary}`,
      detail: summary,
      source: 'ai',
      importance: 'normal',
      metadata: { atMessage: total },
    })
    console.log(`[Bitácora] AI summary written for contact=${params.contactId} at ${total} msgs`)
  } catch (err) {
    console.warn('[Bitácora] maybeWriteAiSummary failed (non-critical):', err instanceof Error ? err.message : err)
  }
}
