// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Follow-Up Engine (AUTÓNOMO PERPETUO)
// El motor que no suelta nunca al lead.
//
// Principio: "Un lead nunca se pierde. Solo está mal seguido."
//
// Timeline: 30min → 24h → 72h → 7d → 15d → 30d → 45d → 60d → 75d → 90d → 120d → 180d
// Reset: Cada vez que el lead responde, cancela todo y reinicia.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI } from './providers'
import { buildDynamicContext } from './context-builder'
import { logInfo, logOk, logWarn, logError } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────

export type LeadState = 'nuevo' | 'frio' | 'tibio' | 'caliente' | 'cerrado' | 'perdido'
export type FollowUpTipo =
  | 'recordatorio_suave'
  | 'valor'
  | 'prueba_social'
  | 'urgencia_suave'
  | 'recordatorio_necesidad'
  | 'nueva_oferta'
  | 'reactivacion_emocional'
  | 'reactivacion_final'

export interface FollowUpStepConfig {
  step: number
  delayMinutes: number
  tipo: FollowUpTipo
  label: string
}

// ─── TIMELINE (12 pasos, obligatorio) ─────────────────────────

export const FOLLOW_UP_TIMELINE: FollowUpStepConfig[] = [
  // Zona caliente: 30min – 24h (recordatorio suave)
  { step: 0,  delayMinutes: 30,            tipo: 'recordatorio_suave',      label: '+30 minutos' },
  { step: 1,  delayMinutes: 24 * 60,       tipo: 'recordatorio_suave',      label: '+24 horas' },
  // Zona tibia: 72h – 7d (valor + prueba social)
  { step: 2,  delayMinutes: 72 * 60,       tipo: 'valor',                  label: '+72 horas' },
  { step: 3,  delayMinutes: 7 * 24 * 60,   tipo: 'prueba_social',          label: '+7 días' },
  // Zona fría: 15d – 45d (urgencia + necesidad + nueva oferta)
  { step: 4,  delayMinutes: 15 * 24 * 60,  tipo: 'urgencia_suave',         label: '+15 días' },
  { step: 5,  delayMinutes: 30 * 24 * 60,  tipo: 'recordatorio_necesidad', label: '+30 días' },
  { step: 6,  delayMinutes: 45 * 24 * 60,  tipo: 'nueva_oferta',           label: '+45 días' },
  // Zona reactivación: 60d – 180d (emocional → final)
  { step: 7,  delayMinutes: 60 * 24 * 60,  tipo: 'reactivacion_emocional', label: '+60 días' },
  { step: 8,  delayMinutes: 75 * 24 * 60,  tipo: 'reactivacion_emocional', label: '+75 días' },
  { step: 9,  delayMinutes: 90 * 24 * 60,  tipo: 'reactivacion_final',     label: '+90 días' },
  { step: 10, delayMinutes: 120 * 24 * 60, tipo: 'reactivacion_final',     label: '+120 días' },
  { step: 11, delayMinutes: 180 * 24 * 60, tipo: 'reactivacion_final',     label: '+180 días' },
]

// ─── Edge Case Detectors ──────────────────────────────────────

const EDGE_CASES = [
  // ── Pause 30d (rechazo suave) ──
  { pattern: /\bno me interesa\b/i,                     action: 'pause_30d' as const,   reason: 'Lead dijo no le interesa' },
  { pattern: /\bno gracias\b/i,                         action: 'pause_30d' as const,   reason: 'Lead dijo no gracias' },
  { pattern: /\bno quiero\b/i,                          action: 'pause_30d' as const,   reason: 'Lead dijo no quiere' },
  { pattern: /\bestoy viendo otras opciones\b/i,        action: 'pause_30d' as const,   reason: 'Lead está comparando' },
  { pattern: /\bmejor lo pienso\b/i,                    action: 'pause_30d' as const,   reason: 'Lead quiere pensarlo' },
  // ── Close won (ya compró) ──
  { pattern: /\bye(s)? compr(e|é|ó)\b/i,              action: 'close_won' as const,   reason: 'Lead ya compró' },
  { pattern: /\balready (bought|purchased|have)\b/i,    action: 'close_won' as const,   reason: 'Lead already bought (en)' },
  { pattern: /\bya me (saqu[eé]|adelant[eé]|compr[eé])\b/i, action: 'close_won' as const, reason: 'Lead ya sacó/adelantó el auto' },
  { pattern: /\bya (lo|la) (compr[eé]|saqu[eé])\b/i,   action: 'close_won' as const,   reason: 'Lead ya compró el vehículo' },
  // ── Continue (postergación) ──
  { pattern: /\bluego\b/i,                              action: 'continue' as const,    reason: 'Lead dijo luego — seguir timeline' },
  { pattern: /\bdespu(e|é)s\b/i,                        action: 'continue' as const,    reason: 'Lead dijo después — seguir timeline' },
  { pattern: /\b(aviso|pregunto|busco) (despu[eé]s|m[aá]s tarde)\b/i, action: 'continue' as const, reason: 'Lead pidió seguir después' },
  { pattern: /\bqu[eé] (queda|hace) (m[aá]s|bien)? en\b/i, action: 'continue' as const, reason: 'Lead pidió follow-up posterior' },
  // ── Pause 60d (rechazo fuerte) ──
  { pattern: /\bno molestar?\b/i,                       action: 'pause_60d' as const,   reason: 'Lead pidió no molestar' },
  { pattern: /\bend(?:i|í|io)\s*de\s*conversaci[oó]n\b/i, action: 'pause_60d' as const, reason: 'Lead terminó conversación' },
  { pattern: /\bno (me|nos) escribas\b/i,               action: 'pause_60d' as const,   reason: 'Lead pidió no escribirle' },
  { pattern: /\bborrar\b.*\b(?:n[uú]mero|contacto|chat)\b/i, action: 'pause_60d' as const, reason: 'Lead amenazó con borrar' },
]

// ─── PROMPT PARA GENERACIÓN DE MENSAJES ───────────────────────

function buildFollowUpPrompt(
  tipo: FollowUpTipo,
  businessContext: string,
  contactName: string,
  conversationHistory: string,
  contextSummary: string,
  minutesSinceLastMessage: number
): string {
  const daysSince = Math.floor(minutesSinceLastMessage / (24 * 60))

  // ── 8 TIPOS DE MENSAJE OPTIMIZADOS PARA AUTOS SEMINUEVOS ──
  // Cada tipo tiene una estrategia, tono y estructura específica.
  // El engine usa estos prompts como system para generar mensajes dinámicos.
  const tipoInstructions: Record<FollowUpTipo, string> = {
    // ────────────────────────────────────────────────────────────
    // 1. RECORDATORIO SUAVE  (+30min / +24h)
    // Zona caliente: el lead acaba de hablar. No presionar.
    // Retomar el hilo naturalmente, como si fueras a revisar el catálogo.
    // ────────────────────────────────────────────────────────────
    recordatorio_suave: `TIPO: RECORDATORIO SUAVE

Estrategia: Retoma la conversación como si acabaras de revisar el inventario y encontraste algo que le sirve.

Tono: Casual, amigable, como un buen amigo que les cae bien. Habla como Jhon Asesor de AutoMax.

Estructura obligatoria:
- Referencia algo específico de lo que el lead busca (ej: SUV familiar, buen rendimiento, espacio)
- Menciona que revisaste el inventario y tienes opciones que coinciden
- Termina con UNA pregunta abierta que invite a seguir

Ejemplos de ángulos (NO copiar, usa como inspiración):
- "Acabo de revisar y tengo una SUV que podría ser justo lo que necesitas..."
- "Me acordé de ti, queria mostrarte algo que acaba de entrar..."
- "Tengo una pregunta sobre lo que buscas para afinar la busqueda..."

PROHIBIDO: No digas "te escribo de nuevo", "solo queria confirmar", "no te olvides".`,

    // ────────────────────────────────────────────────────────────
    // 2. MENSAJE DE VALOR / INFORMACION  (+72h)
    // Educación: resuelve una objeción invisible antes de que aparezca.
    // Da información útil que el lead no sabía que necesitaba.
    // ────────────────────────────────────────────────────────────
    valor: `TIPO: MENSAJE DE VALOR / INFORMACION

Estrategia: Aporta información útil sobre el proceso de compra de auto seminuevo que el lead probablemente no sabe.

Tono: Experto pero accesible. Eres el asesor que sabe todo de autos y financiamiento.

Elige UNO de estos ángulos (varía cada vez, no repitas):
- Tipos de financiamiento disponibles (enganche desde 20-30%, meses sin intereses)
- Garantía incluida en autos seminuevos certificados
- Diferencia entre millaje aceptable vs excesivo
- Por qué un auto seminuevo con 2-3 años es mejor inversión que uno nuevo
- Seguro de auto: cómo funciona al financiar un seminuevo
- Historial de servicio: qué revisar antes de comprar
- Tips de compra: qué verificar en prueba de manejo
- Depreciación: cuánto pierde valor un auto en los primeros 3 años

Estructura:
- Arranca con un dato curioso o un tip que sorprenda
- Conectalo con lo que el lead busca
- Termina con una pregunta relacionada

PROHIBIDO: No vendas directamente. Solo educa y conecta.`,

    // ────────────────────────────────────────────────────────────
    // 3. PRUEBA SOCIAL  (+7 días)
    // Muestra que otros clientes como él ya confiaron y están felices.
    // ────────────────────────────────────────────────────────────
    prueba_social: `TIPO: PRUEBA SOCIAL

Estrategia: Cuenta una historia breve de otro cliente con necesidades similares que encontró su auto aquí y está feliz.

Tono: Orgulloso pero humilde. "Me da gusto contarte porque me recordó a ti."

Estructura obligatoria:
- "Se me hace que te cuento..." o "Me acuerdo de un cliente que..."
- Describe la situación del otro cliente (similar al lead actual)
- Menciona el auto que se llevó y cómo le va
- Termina preguntando si le gustaría ver opciones parecidas

Reglas estrictas:
- La historia debe ser VEROSÍMIL y contextualizada al negocio (concesionaria de seminuevos en GDL)
- Si el lead busca SUV, el ejemplo debe ser de alguien que buscaba SUV
- Si el lead tiene presupuesto X, el ejemplo debe ser de alguien con presupuesto similar
- NO inventes nombres reales. Usa "un cliente" o "una señora" o "un señor"
- MÁXIMO 3-4 líneas

PROHIBIDO: No suenes a testimonial falso. No uses exceso de adjetivos.`,

    // ────────────────────────────────────────────────────────────
    // 4. URGENCIA SUAVE  (+15 días)
    // Sin mentir: usa hechos reales (rotación de inventario, demanda).
    // ────────────────────────────────────────────────────────────
    urgencia_suave: `TIPO: URGENCIA SUAVE

Estrategia: Crea urgencia real basada en hechos del negocio, sin mentir ni inventar.

Tono: Informativo, no desesperado. "Te aviso porque sé que te interesa."

Elige UNO de estos ángulos:
- Rotación de inventario: "Ese tipo de auto se mueve rápido, entro y sale en menos de X días"
- Oferta vigente: "Esta semana tenemos un financiamiento especial que podría servirte"
- Unidad específica: "Tengo una unidad que encaja con lo que buscas y ya tiene 2 personas preguntando"
- Temporada: "Estamos en temporada alta y el inventario se renueva cada semana"

Reglas:
- La urgencia debe ser VEROSÍMIL y contextualizada
- NUNCA inventes unidades que no existen
- NUNCA digas "última unidad" ni "si no compras hoy se acaba"
- Termina con una acción clara: agendar visita, llamada, prueba de manejo

PROHIBIDO: No presiones. No mentiras. No falsa escasez.`,

    // ────────────────────────────────────────────────────────────
    // 5. RECORDATORIO DE NECESIDAD  (+30 días)
    // Reconecta con el dolor/objetivo original del lead.
    // ────────────────────────────────────────────────────────────
    recordatorio_necesidad: `TIPO: RECORDATORIO DE NECESIDAD

Estrategia: Reconecta al lead con su necesidad original (ej: cambiar su Río por una SUV más grande, más segura, mejor rendimiento).

Tono: Empático, comprensivo. "Entiendo que es una decisión importante."

Estructura:
- Reconoce que tomar la decisión de cambiar auto no es fácil
- Recuerda por qué el lead quería cambiar (referencia su auto actual y lo que busca)
- Menciona un beneficio concreto de hacer el cambio YA (seguridad, espacio, rendimiento, valor)
- Termina con una invitación baja presión: "¿Te gustaría que te muestre opciones sin compromiso?"

Reglas:
- Usa la información específica del lead (auto actual, lo que busca, presupuesto)
- Si no tienes datos específicos, usa el contexto de la conversación
- Enfócate en el beneficio de ACTUAR, no en la pérdida de NO actuar

PROHIBIDO: No hagas sentir mal al lead. No digas "ya deberías haberlo hecho". No uses miedo.`,

    // ────────────────────────────────────────────────────────────
    // 6. NUEVA OFERTA / INVENTARIO FRESCO  (+45 días)
    // Ofrece algo nuevo y diferente a lo que ya se le mostró.
    // ────────────────────────────────────────────────────────────
    nueva_oferta: `TIPO: NUEVA OFERTA / INVENTARIO FRESCO

Estrategia: Preséntale algo NUEVO que no había visto antes. Un ángulo diferente, una opción distinta, una promoción.

Tono: Entusiasta pero natural. "Me emociona mostrarte esto porque creo que te va a gustar."

Elige UNO de estos ángulos:
- Nueva llegada: "Acaba de entrar una unidad que me recordó a ti..."
- Precio ajustado: "Tenemos una promo de enganche reducido esta semana..."
- Alternativa sugerente: "Qué tal si en lugar de X, ves esta otra opción que tiene..."
- Combo atractivo: "Si te decides esta semana, te incluimos..."

Reglas:
- El mensaje debe ser CLARAMENTE diferente a todo lo que se ha enviado antes
- Si antes se habló de una marca, ahora se puede mencionar otra comparable
- Si el presupuesto era 150k, puedes presentar opciones entre 120k-180k
- Termina con pregunta específica, no genérica

PROHIBIDO: No repitas opciones ya mencionadas. No digas "te sigo esperando". No suenes necesitado.`,

    // ────────────────────────────────────────────────────────────
    // 7. REACTIVACION EMOCIONAL  (+60-75 días)
    // Cambia radicalmente el ángulo. Mensaje inesperado.
    // ────────────────────────────────────────────────────────────
    reactivacion_emocional: `TIPO: REACTIVACION EMOCIONAL

Estrategia: Envía un mensaje completamente inesperado que rompa el patrón anterior. No suenes a vendedor.

Tono: Personal, directo, como si te acordaras de él de repente. SIN tono de venta.

Elige UNO de estos ángulos:
- Dato curioso: "Oye, sabías que el auto que tienes pierde X% de valor al año? Te lo digo porque..."
- Pregunta personal: "¿Cómo te va con tu Río? Espero que bien. Me acordé de ti porque..."
- Consejo genuino: "Te voy a ser honesto, sin compromiso..."
- Noticia del mercado: "Te cuento algo que está pasando en el mercado de seminuevos..."
- Historia corta: "Hoy pasó algo en el piso de ventas que me hizo acordar de ti..."

Reglas:
- NO preguntes si ya compró (asume que no, pero con respeto)
- NO suenes como follow-up. Debe sentirse como un mensaje espontáneo
- El mensaje debe ser INTERESANTE por sí mismo, aunque no responda
- MÁXIMO 3 líneas
- Máximo 1 emoji

PROHIBIDO: No abiertas con "Hola, ¿cómo estás?". No cierres con "avisame". No uses negrita.`,

    // ────────────────────────────────────────────────────────────
    // 8. REACTIVACION FINAL SUAVE  (+90-180 días)
    // Último intento: honesto, directo, sin presión, dejando la puerta abierta.
    // ────────────────────────────────────────────────────────────
    reactivacion_final: `TIPO: REACTIVACION FINAL SUAVE

Estrategia: Último mensaje antes de marcar como perdido. Debe ser honesto, respetuoso, y dejar la puerta abierta.

Tono: Sincero, sin rencor, profesional. "Te respeto tu tiempo, solo queria dejarte esto."

Estructura:
- Reconoce que no ha sido el momento (sin culpa)
- Ofrece UN valor final (dato útil, link de inventario, un último consejo)
- Deja la puerta completamente abierta: "Si en algún momento cambias de opinión, aquí estoy"
- NO preguntes nada que requiera respuesta (respeta su silencio)

Reglas:
- Este mensaje debe hacer sentir BIEN al lead, no presionado
- Es el último contacto del timeline — debe cerrar con clase
- Si el lead responde DESPUÉS de este mensaje, el timeline se reinicia desde step 0
- MÁXIMO 3 líneas

PROHIBIDO: No digas "último mensaje". No muestres frustración. No uses "te extrañamos". No preguntas cerradas.`,
  }

  return `${businessContext}

ESTADO DEL LEAD:
- Nombre: ${contactName}
- Sin responder hace: ${daysSince} día(s)
- Resumen del contexto: ${contextSummary || 'Primera interacción'}

HISTORIAL DE CONVERSACION (ultimos mensajes):
${conversationHistory || 'Sin historial previo'}

═══ INSTRUCCIONES DE MENSAJE ═══
${tipoInstructions[tipo]}

═══ REGLAS DE ORO ═══
- Corto, natural, conversacional. Como WhatsApp real.
- Tono: amigable, cercano, mexicano. Habla como Jhon Asesor.
- UNA sola idea. UNA sola acción.
- NUNCA repitas un mensaje anterior del historial.
- NUNCA suenes robot, desesperado o repetitivo.
- NUNCA presiones.
- NUNCA menciones que es un mensaje automatico.
- SIEMPRE aporta algo de valor en cada mensaje.
- Maximo 4 lineas + maximo 1 emoji.
- Termina con pregunta clara que invite respuesta (excepto reactivacion_final).
- Personaliza con datos reales del lead (auto actual, lo que busca, presupuesto).

FORMATO: Responde SOLO con el mensaje a enviar. Sin explicaciones, sin etiquetas, sin formato, sin comillas.`
  }

  // ─── CORE FUNCTIONS ──────────────────────────────────────────

/**
 * Schedule the next follow-up for a contact.
 * Called after each interaction or after a follow-up is sent.
 */
export async function scheduleNextFollowUp(
  contactId: string,
  workspaceId: string,
  conversationId: string,
  step: number
): Promise<{ success: boolean; nextAt?: Date; step?: number } | null> {
  if (step >= FOLLOW_UP_TIMELINE.length) {
    // Timeline complete — lead is "perdido"
    await db.contact.update({
      where: { id: contactId },
      data: { leadState: 'perdido' },
    })
    logWarn('FOLLOWUP', 'timeline_complete', { contactId, reason: 'All 12 steps exhausted' })
    return null
  }

  const config = FOLLOW_UP_TIMELINE[step]
  const nextAt = new Date(Date.now() + config.delayMinutes * 60 * 1000)

  // Find or create a FollowUpRule for tracking
  let rule = await db.followUpRule.findFirst({
    where: { workspaceId, isActive: true },
    select: { id: true },
  })

  if (!rule) {
    rule = await db.followUpRule.create({
      data: {
        workspaceId,
        name: 'Auto Follow-Up Engine',
        description: 'Sistema automático de seguimiento perpetuo',
        triggerType: 'inactivity',
        isActive: true,
        messageTemplate: '',
      },
    })
  }

  const task = await db.followUpTask.create({
    data: {
      workspaceId,
      ruleId: rule.id,
      contactId,
      conversationId,
      status: 'pending',
      tipo: config.tipo,
      scheduledAt: nextAt,
    },
  })

  // Update contact with next follow-up info
  await db.contact.update({
    where: { id: contactId },
    data: {
      nextFollowUpAt: nextAt,
      followUpStep: step,
    },
  })

  logOk('FOLLOWUP', 'scheduled', {
    contactId,
    step: config.step,
    tipo: config.tipo,
    label: config.label,
    scheduledFor: nextAt.toISOString(),
    taskId: task.id,
  })

  return { success: true, nextAt, step: config.step }
}

/**
 * RESET: Called when a lead responds.
 * Cancels ALL pending follow-ups and restarts from step 0.
 */
export async function resetFollowUpTimeline(
  contactId: string
): Promise<{ success: boolean; cancelled: number }> {
  // Cancel ALL non-terminal follow-up tasks (pending + processing)
  // FIX RACE CONDITION: Also cancel 'processing' tasks that a concurrent
  // worker run might have already reserved. This prevents the worker from
  // sending a follow-up after the lead already responded.
  const result = await db.followUpTask.updateMany({
    where: {
      contactId,
      status: { in: ['pending', 'processing'] },
    },
    data: { status: 'cancelled' },
  })

  // Reset contact state
  await db.contact.update({
    where: { id: contactId },
    data: {
      followUpStep: 0,
      nextFollowUpAt: null,
      followUpPaused: false,
      followUpPauseUntil: null,
    },
  })

  logInfo('FOLLOWUP', 'timeline_reset', {
    contactId,
    cancelledTasks: result.count,
  })

  return { success: true, cancelled: result.count }
}

/**
 * Classify lead state based on interaction patterns.
 * FIX: Score now matters at ALL time brackets — not just the first hour.
 * Before: A lead with score 80 who went silent for 2h was demoted to 'tibio'.
 * Now: High-score leads stay 'caliente' up to 24h. Score is never ignored.
 */
export function classifyLeadState(
  leadScore: number,
  minutesSinceLastMessage: number,
  followUpStep: number
): LeadState {
  // Timeline exhausted → lost
  if (followUpStep >= FOLLOW_UP_TIMELINE.length) return 'perdido'

  const oneHour = 60
  const oneDay = 24 * 60
  const threeDays = 72 * 60

  // ── CALIENTE: High engagement or very high score ──
  // Score >= 70 stays caliente for up to 24 hours
  // Score >= 50 stays caliente for up to 1 hour
  if (leadScore >= 70 && minutesSinceLastMessage < oneDay) return 'caliente'
  if (leadScore >= 50 && minutesSinceLastMessage < oneHour) return 'caliente'

  // ── TIBIO: Moderate engagement ──
  // Score >= 30 stays tibio for up to 1 hour
  // Score >= 20 stays tibio for up to 24 hours
  // Score >= 40 stays tibio for up to 3 days (worth watching)
  if (leadScore >= 30 && minutesSinceLastMessage < oneHour) return 'tibio'
  if (leadScore >= 20 && minutesSinceLastMessage < oneDay) return 'tibio'
  if (leadScore >= 40 && minutesSinceLastMessage < threeDays) return 'tibio'

  // ── NUEVO: Recent interaction (within 1h) even with low score, OR early timeline ──
  if (minutesSinceLastMessage < oneHour) return 'nuevo'
  if (followUpStep <= 1) return 'nuevo'

  // ── Safety net: Don't demote medium-score leads at steps 2-3 ──
  if (leadScore >= 30 && followUpStep <= 3) return 'tibio'

  return 'frio'
}

/**
 * Check edge cases in last user message.
 * Returns action to take.
 */
export function detectEdgeCase(messageText: string): {
  action: 'pause_30d' | 'pause_60d' | 'close_won' | 'close_lost' | 'continue'
  reason: string
} | null {
  for (const edge of EDGE_CASES) {
    if (edge.pattern.test(messageText)) {
      return { action: edge.action, reason: edge.reason }
    }
  }
  return null
}

/**
 * Handle edge case — pause or close lead.
 */
export async function handleEdgeCase(
  contactId: string,
  action: 'pause_30d' | 'pause_60d' | 'close_won' | 'close_lost' | 'continue',
  reason: string
): Promise<void> {
  switch (action) {
    case 'pause_30d': {
      const pauseUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      await db.contact.update({
        where: { id: contactId },
        data: {
          followUpPaused: true,
          followUpPauseUntil: pauseUntil,
        },
      })
      // Cancel pending
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending' },
        data: { status: 'cancelled' },
      })
      logInfo('FOLLOWUP', 'paused_30d', { contactId, reason })
      break
    }
    case 'pause_60d': {
      const pauseUntil = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      await db.contact.update({
        where: { id: contactId },
        data: {
          followUpPaused: true,
          followUpPauseUntil: pauseUntil,
        },
      })
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending' },
        data: { status: 'cancelled' },
      })
      logInfo('FOLLOWUP', 'paused_60d', { contactId, reason })
      break
    }
    case 'close_won': {
      await db.contact.update({
        where: { id: contactId },
        data: {
          leadState: 'cerrado',
          followUpPaused: true,
        },
      })
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending' },
        data: { status: 'cancelled' },
      })
      logOk('FOLLOWUP', 'closed_won', { contactId, reason })
      break
    }
    case 'close_lost': {
      await db.contact.update({
        where: { id: contactId },
        data: {
          leadState: 'perdido',
          followUpPaused: true,
        },
      })
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending' },
        data: { status: 'cancelled' },
      })
      logInfo('FOLLOWUP', 'closed_lost', { contactId, reason })
      break
    }
    case 'continue':
      // Keep timeline as-is
      logInfo('FOLLOWUP', 'edge_continue', { contactId, reason })
      break
  }
}

/**
 * Generate context summary for a contact using AI.
 * Summarizes what the lead wanted, where they left off, objections detected.
 */
export async function generateContextSummary(
  contactId: string,
  conversationId: string,
  workspaceSettings: Record<string, unknown>
): Promise<string> {
  try {
    // Load last 10 messages
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { content: true, senderType: true, createdAt: true },
    })

    if (messages.length === 0) return ''

    const history = messages
      .reverse()
      .map(m => `[${m.senderType === 'contact' ? 'Cliente' : 'IA'}]: ${m.content}`)
      .join('\n')

    const dynamicContext = buildDynamicContext(workspaceSettings)

    const result = await chatWithAI([
      {
        role: 'system',
        content: `${dynamicContext}

TAREA: Resume en MÁXIMO 3 frases la conversación con un prospecto de compra de auto seminuevo. Incluye:
1. Qué auto tiene actualmente y qué quiere cambiar (marca, modelo, características)
2. Presupuesto mencionado (enganche, mensualidad, precio total)
3. En qué se quedó la conversación (agendó visita, pidió financiamiento, no respondió, etc.)
4. Objeciones detectadas (precio, millaje, garantía, plazo, etc.)
5. Nivel de interés: alto / medio / bajo

FORMATO: Solo el resumen, sin etiquetas, sin viñetas, sin formato. Texto continuo.`,
      },
      { role: 'user', content: history },
    ], 'groq', undefined, { temperature: 0.3, maxTokens: 300 })

    return result.content.trim()
  } catch (err) {
    logError('FOLLOWUP', 'context_summary_failed', err, { contactId })
    return ''
  }
}

/**
 * Generate a dynamic follow-up message using AI.
 * NEVER uses templates — always contextual.
 */
export async function generateFollowUpMessage(
  contactId: string,
  conversationId: string,
  tipo: FollowUpTipo,
  workspaceSettings: Record<string, unknown>
): Promise<string> {
  // Load contact
  const contact = await db.contact.findUnique({ where: { id: contactId } })
  if (!contact) throw new Error(`Contact ${contactId} not found`)

  // Load last 10 messages for context
  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { content: true, senderType: true, createdAt: true },
  })

  const history = messages
    .reverse()
    .map(m => `${m.senderType === 'contact' ? 'Cliente' : 'Asistente'}: ${m.content}`)
    .join('\n')

  // Calculate time since last message
  const lastMessage = messages[0] // Most recent (we ordered desc)
  const minutesSince = lastMessage
    ? Math.floor((Date.now() - lastMessage.createdAt.getTime()) / (1000 * 60))
    : 60

  // Build business context
  const businessContext = buildDynamicContext(workspaceSettings)

  const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Cliente'

  // Build prompt
  const prompt = buildFollowUpPrompt(
    tipo,
    businessContext,
    contactName,
    history,
    contact.contextSummary || '',
    minutesSince
  )

  // Generate message
  const result = await chatWithAI(
    [{ role: 'system', content: prompt }],
    'groq',
    undefined,
    { temperature: 0.7, maxTokens: 300 }
  )

  const cleanMessage = result.content
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\*\*/g, '')

  logOk('FOLLOWUP', 'message_generated', {
    contactId,
    tipo,
    length: cleanMessage.length,
  })

  return cleanMessage
}

/**
 * START: Initialize (or restart) follow-up timeline for a contact.
 * Called by message-processor.ts after every lead response (step 14c).
 *
 * Logic:
 *   - If lead is cerrado or perdido → skip (respect terminal states)
 *   - If lead is paused → skip (respect pause period)
 *   - If there are already pending tasks → skip (avoid duplicates)
 *   - Otherwise → schedule step 0 (+30 min)
 */
export async function startFollowUpTimeline(
  contactId: string,
  workspaceId: string,
  conversationId: string
): Promise<void> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: {
      followUpStep: true,
      leadState: true,
      followUpPaused: true,
      followUpPauseUntil: true,
    },
  })

  if (!contact) return

  // ── Guard: terminal states ──
  if (contact.leadState === 'cerrado' || contact.leadState === 'perdido') {
    logInfo('FOLLOWUP', 'timeline_skipped_terminal', {
      contactId,
      leadState: contact.leadState,
    })
    return
  }

  // ── Guard: paused lead ──
  if (contact.followUpPaused) {
    // Check if pause period ended
    if (contact.followUpPauseUntil && contact.followUpPauseUntil <= new Date()) {
      // Auto-resume: clear pause flags (message-processor already reset step to 0)
      await db.contact.update({
        where: { id: contactId },
        data: { followUpPaused: false, followUpPauseUntil: null },
      })
      logInfo('FOLLOWUP', 'pause_auto_resumed_on_start', { contactId })
    } else {
      logInfo('FOLLOWUP', 'timeline_skipped_paused', { contactId })
      return
    }
  }

  // ── Guard: avoid duplicates — check for existing pending tasks ──
  const existingPending = await db.followUpTask.count({
    where: { contactId, status: 'pending' },
  })

  if (existingPending > 0) {
    logInfo('FOLLOWUP', 'timeline_skipped_has_pending', {
      contactId,
      pendingCount: existingPending,
    })
    return
  }

  // ── Schedule step 0 (+30 min) ──
  await scheduleNextFollowUp(contactId, workspaceId, conversationId, 0)
  logOk('FOLLOWUP', 'timeline_started', {
    contactId,
    leadState: contact.leadState,
  })
}
