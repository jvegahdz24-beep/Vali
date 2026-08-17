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
import { PLANS } from '@/lib/constants'
import { markDisinterested } from './follow-up-guard'
import { nextAllowedSend } from './quiet-hours'

// ─── CustomFields Helper ────────────────────────────────────
// Follow-up engine stores its state in contact.customFields (JSON)
// since the schema doesn't have dedicated fields.

interface FollowUpContactState {
  leadState?: string
  followUpStep?: number
  nextFollowUpAt?: string
  followUpPaused?: boolean
  followUpPauseUntil?: string
  contextSummary?: string
}

async function getContactFUState(contactId: string): Promise<FollowUpContactState> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { customFields: true },
  })
  if (!contact) return {}
  try {
    const cf = typeof contact.customFields === 'string'
      ? JSON.parse(contact.customFields || '{}')
      : (contact.customFields || {})
    return cf.followUp || {}
  } catch { return {} }
}

async function setContactFUState(contactId: string, state: FollowUpContactState): Promise<void> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { customFields: true },
  })
  if (!contact) return
  const cf = typeof contact.customFields === 'string'
    ? JSON.parse(contact.customFields || '{}')
    : (contact.customFields || {})
  cf.followUp = { ...cf.followUp, ...state }
  await db.contact.update({
    where: { id: contactId },
    data: { customFields: JSON.stringify(cf) },
  })
}

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
  // ── Gatillos psicológicos del Motor Inteligente (visión de Jhon 2026-07-15):
  // cada contacto de la escalera tiene un OBJETIVO psicológico distinto para
  // que jamás parezca automatización.
  | 'reactivacion_fria'
  | 'reciprocidad'
  | 'curiosidad'
  | 'autoridad'
  | 'dolor'
  | 'fomo'
  | 'micro_compromiso'
  | 'empatia'
  | 'costo_oportunidad'
  // ── Postventa (2026-07-20): el ciclo continúa DESPUÉS de la venta.
  // Estas tareas llevan ruleId 'post-sale' y están exentas del freno anti-spam
  // y del paro "ya es cliente" — su público ES el cliente.
  | 'postventa_checkin'
  | 'postventa_referidos'
  | 'postventa_servicio'
  | 'postventa_aniversario'

export interface FollowUpStepConfig {
  step: number
  delayMinutes: number
  tipo: FollowUpTipo
  label: string
  /** Cola larga (política de Jhon 2026-07-15): un solo contacto MENSUAL hasta
   *  completar el año. Estos pasos están EXENTOS del freno de "máx N sin
   *  respuesta" — solo los detienen las condiciones duras (hardStopFollowUps). */
  longTail?: boolean
}

// ─── TIMELINE — ESCALERA PSICOLÓGICA DEL MOTOR INTELIGENTE ─────
// (Visión de Jhon 2026-07-15: "cada mensaje con un objetivo psicológico
// diferente, nunca repetir, nunca sonar desesperado, conversación viva".)
// Los delays son el GAP respecto al envío anterior; los labels indican el
// día ABSOLUTO aproximado desde el último mensaje del lead.
//
// ⚠️ CÓMO CONVIVE CON EL FRENO (política de Jhon 2026-07-15):
// - RÁFAGA (pasos 0-7): el freno "máx N sin respuesta" (default 2,
//   settings.maxUnansweredFollowUps) manda. Al toparse, el worker marca
//   'desinteresado' EN SILENCIO y hace la TRANSICIÓN a la cola larga.
// - COLA LARGA (pasos 8+, longTail): un solo contacto MENSUAL hasta el año.
//   EXENTA del freno; solo la detienen condiciones duras (hardStopFollowUps:
//   IA apagada para el contacto, pausa por edge-case, cliente ganado, spam).
// - Cada respuesta del lead REINICIA todo a 0 (resetFollowUpTimeline).
// - Cada paso se agenda al ENVIAR el anterior (worker → scheduleNextFollowUp).

const H = 60, D = 24 * 60

export const FOLLOW_UP_TIMELINE: FollowUpStepConfig[] = [
  // ── Ráfaga inicial (sujeta al freno anti-spam) ──
  { step: 0,  delayMinutes: 24 * H, tipo: 'reciprocidad',      label: '24h — gracias por tu tiempo + oportunidad detectada' },
  { step: 1,  delayMinutes: 24 * H, tipo: 'curiosidad',        label: '48h — encontré algo interesante para tu caso' },
  { step: 2,  delayMinutes: 24 * H, tipo: 'autoridad',         label: '72h — el patrón que vemos antes de implementar' },
  { step: 3,  delayMinutes: 2 * D,  tipo: 'dolor',             label: 'día 5 — ¿cuántos te compraron a otro por velocidad?' },
  { step: 4,  delayMinutes: 2 * D,  tipo: 'prueba_social',     label: 'día 7 — un negocio como el tuyo lo logró' },
  { step: 5,  delayMinutes: 3 * D,  tipo: 'fomo',              label: 'día 10 — tu competencia también da seguimiento' },
  { step: 6,  delayMinutes: 5 * D,  tipo: 'micro_compromiso',  label: 'día 15 — ¿sí o no? 😊' },
  { step: 7,  delayMinutes: 6 * D,  tipo: 'empatia',           label: 'día 21 — sé que el día a día consume' },
  // ── COLA LARGA: 1 contacto al mes hasta completar el año, gatillo rotativo ──
  { step: 8,  delayMinutes: 9 * D,  tipo: 'costo_oportunidad',      label: 'día 30 — ¿cómo te fue este mes?',              longTail: true },
  { step: 9,  delayMinutes: 30 * D, tipo: 'nueva_oferta',           label: 'día 60 — algo nuevo que no habías visto',      longTail: true },
  { step: 10, delayMinutes: 30 * D, tipo: 'curiosidad',             label: 'día 90 — dato del mercado',                    longTail: true },
  { step: 11, delayMinutes: 30 * D, tipo: 'prueba_social',          label: 'día 120 — otro caso como el tuyo',             longTail: true },
  { step: 12, delayMinutes: 30 * D, tipo: 'reactivacion_emocional', label: 'día 150 — mensaje inesperado',                 longTail: true },
  { step: 13, delayMinutes: 30 * D, tipo: 'valor',                  label: 'día 180 — tip útil sin venta',                 longTail: true },
  { step: 14, delayMinutes: 30 * D, tipo: 'dolor',                  label: 'día 210 — la fuga silenciosa sigue',           longTail: true },
  { step: 15, delayMinutes: 30 * D, tipo: 'autoridad',              label: 'día 240 — lo que vimos este trimestre',        longTail: true },
  { step: 16, delayMinutes: 30 * D, tipo: 'fomo',                   label: 'día 270 — el mercado no espera',               longTail: true },
  { step: 17, delayMinutes: 30 * D, tipo: 'costo_oportunidad',      label: 'día 300 — casi un año: ¿qué cambió?',          longTail: true },
  { step: 18, delayMinutes: 30 * D, tipo: 'micro_compromiso',       label: 'día 330 — ¿retomamos? sí o no 😊',             longTail: true },
  { step: 19, delayMinutes: 30 * D, tipo: 'empatia',                label: 'día 360 — la puerta sigue abierta',            longTail: true },
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
  // ⚠️ En JS, \b NO funciona después de vocal ACENTUADA (é/ó no son \w) — con
  // \b al final, "ya lo compré" jamás matcheaba (bug real encontrado en QA
  // 2026-07-15). Se usa (?!\w) como cierre seguro con acentos.
  { pattern: /\bya compr(e|é|ó)(?!\w)/i,                action: 'close_won' as const,   reason: 'Lead ya compró' },
  { pattern: /\balready (bought|purchased|have)\b/i,    action: 'close_won' as const,   reason: 'Lead already bought (en)' },
  { pattern: /\bya me (saqu[eé]|adelant[eé]|compr[eé])(?!\w)/i, action: 'close_won' as const, reason: 'Lead ya sacó/adelantó su producto' },
  { pattern: /\bya (lo|la) (compr[eé]|saqu[eé])(?!\w)/i, action: 'close_won' as const,  reason: 'Lead ya compró el producto' },
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
  minutesSinceLastMessage: number,
  leadFicha = '',
  previousFollowUps = ''
): string {
  const daysSince = Math.floor(minutesSinceLastMessage / (24 * 60))

  // ── 8 TIPOS DE MENSAJE OPTIMIZADOS PARA VENTAS ──
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

Tono: Casual, amigable, como un buen amigo que les cae bien. Habla como Asesor comercial.

Estructura obligatoria:
- Referencia algo específico de lo que el lead busca (ej: producto premium, buen rendimiento, espacio)
- Menciona que revisaste el inventario y tienes opciones que coinciden
- Termina con UNA pregunta abierta que invite a seguir

Ejemplos de ángulos (NO copiar, usa como inspiración):
- "Acabo de revisar y tengo un producto premium que podría ser justo lo que necesitas..."
- "Me acordé de ti, queria mostrarte algo que acaba de entrar..."
- "Tengo una pregunta sobre lo que buscas para afinar la busqueda..."

PROHIBIDO: No digas "te escribo de nuevo", "solo queria confirmar", "no te olvides".`,

    // ────────────────────────────────────────────────────────────
    // 2. MENSAJE DE VALOR / INFORMACION  (+72h)
    // Educación: resuelve una objeción invisible antes de que aparezca.
    // Da información útil que el lead no sabía que necesitaba.
    // ────────────────────────────────────────────────────────────
    valor: `TIPO: MENSAJE DE VALOR / INFORMACION

Estrategia: Aporta información útil sobre el proceso de compra que el lead probablemente no sabe.

Tono: Experto pero accesible. Eres el asesor que sabe todo de productos y planes de pago.

Elige UNO de estos ángulos (varía cada vez, no repitas):
- Tipos de planes de pago disponibles (pago inicial desde 20-30%, meses sin intereses)
- Garantía incluida en productos verificados
- Diferencia entre condición del producto aceptable vs deficiente
- Por qué un producto con 2-3 años de uso es mejor inversión que uno nuevo
- Garantía del producto: cómo funciona al financiar
- Historial de servicio: qué revisar antes de comprar
- Tips de compra: qué verificar en la demostración
- Depreciación: cuánto pierde valor un producto en los primeros 3 años

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
- Menciona el producto que se llevó y cómo le va
- Termina preguntando si le gustaría ver opciones parecidas

Reglas estrictas:
- La historia debe ser VEROSÍMIL y contextualizada al negocio (nuestra empresa)
- Si el lead busca producto premium, el ejemplo debe ser de alguien que buscaba algo similar
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
- Rotación de inventario: "Ese tipo de producto se mueve rápido, entro y sale en menos de X días"
- Oferta vigente: "Esta semana tenemos planes de pago especiales que podrían servirte"
- Unidad específica: "Tengo un producto que encaja con lo que buscas y ya tiene 2 personas preguntando"
- Temporada: "Estamos en temporada alta y el inventario se renueva cada semana"

Reglas:
- La urgencia debe ser VEROSÍMIL y contextualizada
- NUNCA inventes unidades que no existen
- NUNCA digas "última unidad" ni "si no compras hoy se acaba"
- Termina con una acción clara: agendar visita, llamada, demostración

PROHIBIDO: No presiones. No mentiras. No falsa escasez.`,

    // ────────────────────────────────────────────────────────────
    // 5. RECORDATORIO DE NECESIDAD  (+30 días)
    // Reconecta con el dolor/objetivo original del lead.
    // ────────────────────────────────────────────────────────────
    recordatorio_necesidad: `TIPO: RECORDATORIO DE NECESIDAD

Estrategia: Reconecta al lead con su necesidad original (ej: cambiar su producto actual por una opción más grande, más segura, mejor rendimiento).

Tono: Empático, comprensivo. "Entiendo que es una decisión importante."

Estructura:
- Reconoce que tomar la decisión de cambiar no es fácil
- Recuerda por qué el lead quería cambiar (referencia su producto actual y lo que busca)
- Menciona un beneficio concreto de hacer el cambio YA (seguridad, espacio, rendimiento, valor)
- Termina con una invitación baja presión: "¿Te gustaría que te muestre opciones sin compromiso?"

Reglas:
- Usa la información específica del lead (producto actual, lo que busca, presupuesto)
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
- Precio ajustado: "Tenemos una promo de pago inicial reducido esta semana..."
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
- Dato curioso: "Oye, sabías que el producto que tienes pierde X% de valor al año? Te lo digo porque..."
- Pregunta personal: "¿Cómo te va con tu producto actual? Espero que bien. Me acordé de ti porque..."
- Consejo genuino: "Te voy a ser honesto, sin compromiso..."
- Noticia del mercado: "Te cuento algo que está pasando en el mercado..."
- Historia corta: "Hoy pasó algo en la oficina que me hizo acordar de ti..."

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

    // ═══ GATILLOS PSICOLÓGICOS DEL MOTOR INTELIGENTE (Jhon 2026-07-15) ═══
    // Los ejemplos son SEMILLA del ángulo — jamás copiarlos literal: se
    // reconstruyen con los datos REALES de la ficha del lead.

    reactivacion_fria: `GATILLO: RESCATE DE LEAD FRÍO (primer seguimiento a quien escribió y desapareció)
Estrategia: el lead escribió poco y no volvió. Retoma SU último tema/pregunta exacta (está en la ficha), aporta una respuesta o dato útil sobre eso mismo, y cierra con UNA pregunta facilísima de contestar.
Tono: ligero, servicial, cero presión — como quien retoma una plática pendiente, no como quien cobra una respuesta.
PROHIBIDO: "¿sigues interesado?", "te escribo para dar seguimiento", reproches, o presentar todo el pitch de nuevo.`,

    reciprocidad: `GATILLO: RECIPROCIDAD (agradece + regala una observación útil)
Estrategia: agradece genuinamente el tiempo que te dio y devuélvele valor: una observación específica sobre SU problema/situación (de la ficha) y una oportunidad concreta de mejorarlo sin más carga de trabajo.
Semilla del ángulo (adaptar con SUS datos, jamás copiar): "Gracias nuevamente por el tiempo que me regalaste. Me quedé pensando en lo que me comentaste sobre [su problema] y creo que hay varias oportunidades para mejorar ese proceso sin aumentar tu carga de trabajo. Cuando tengas unos minutos me gustaría mostrártelo."
PROHIBIDO: pedir algo a cambio en el mismo mensaje; sonar a plantilla de cortesía.`,

    curiosidad: `GATILLO: CURIOSIDAD (deja una idea abierta — efecto Zeigarnik)
Estrategia: insinúa un hallazgo relevante para SU caso sin revelarlo completo; rompe una creencia común de su giro.
Semilla del ángulo: "Revisando casos muy parecidos al tuyo encontré algo interesante… Muchos creen que el problema es generar más prospectos. En realidad el problema suele ser todo lo que ocurre después del primer mensaje. Creo que vale la pena que lo veas."
PROHIBIDO: resolver la curiosidad en el mismo mensaje; clickbait vacío sin sustancia detrás.`,

    autoridad: `GATILLO: AUTORIDAD (diagnóstico de experto, sin vender)
Estrategia: habla como el especialista que ya analizó su caso: nombra el patrón que ves (con SUS números si los dio) y por qué lo reconoces.
Semilla del ángulo: "Estuve analizando de nuevo tu caso. Honestamente creo que hay ventas que hoy se pierden solo por tiempos de respuesta y seguimiento. No te lo digo para venderte — es exactamente el patrón que vemos antes de implementar el sistema."
PROHIBIDO: presumir; tecnicismos; sonar regañón.`,

    dolor: `GATILLO: DOLOR (pregunta incómoda pero honesta)
Estrategia: UNA pregunta que lo haga dimensionar la fuga que no está viendo, formulada con respeto y usando SU contexto (volumen, cierres, tiempo de respuesta si los dio).
Semilla del ángulo: "Te hago una pregunta… ¿cuántos clientes crees que han dejado de comprarte simplemente porque alguien respondió más rápido? Es incómoda, pero normalmente ahí está la fuga más grande."
PROHIBIDO: culpar; exagerar; hacer más de UNA pregunta.`,

    fomo: `GATILLO: FOMO (lo que pasa mientras no decide)
Estrategia: señala con elegancia que el mercado se mueve: sus prospectos también hablan con la competencia, y la diferencia la hace quien da seguimiento primero.
Semilla del ángulo: "Mientras hablamos… probablemente algunos de tus prospectos también están hablando con tu competencia. La diferencia normalmente no la hace el precio — la hace quien da seguimiento primero."
PROHIBIDO: amenazar; falsa escasez; presionar con fechas inventadas.`,

    micro_compromiso: `GATILLO: MICRO-COMPROMISO (respuesta de un toque)
Estrategia: mensaje ultracorto que pide UNA respuesta binaria — bajar la fricción a cero.
Semilla del ángulo: "Solo necesito una respuesta: ¿sigues buscando mejorar tu proceso comercial? Sí o No 😊"
PROHIBIDO: agregar contexto largo; hacer segunda pregunta; sonar a ultimátum.`,

    empatia: `GATILLO: EMPATÍA (validar su realidad, cero presión)
Estrategia: reconoce que su día a día consume, quita la culpa y deja una puerta fácil de abrir.
Semilla del ángulo: "Sé que el trabajo diario consume muchísimo. No quiero llenarte de mensajes — solo saber si todavía tiene sentido que retomemos la conversación."
PROHIBIDO: reprochar el silencio; victimizarte; despedirte definitivamente.`,

    costo_oportunidad: `GATILLO: COSTO DE OPORTUNIDAD (el tiempo que ya pasó)
Estrategia: usa el tiempo transcurrido desde la última plática como espejo: ¿qué cambió?, ¿el reto sigue ahí? Pregunta con interés genuino, no con reproche.
Semilla del ángulo: "Hace [tiempo] platicamos. Me dio curiosidad… ¿cómo te fue este mes? ¿Sentiste que el seguimiento mejoró o sigue siendo uno de los retos?"
PROHIBIDO: "te lo dije"; recontar la propuesta completa; presión.`,

    // ── POSTVENTA (2026-07-20): el destinatario YA COMPRÓ. Cero venta,
    // puro cuidado de la relación (que a la larga genera referidos).
    postventa_checkin: `POSTVENTA: CHECK-IN DE ENTREGA (+7 días de la compra)
Estrategia: mensaje genuino de servicio — ¿cómo le ha ido con su auto?, ¿todo en orden con papeles/entrega?, ofrécete para cualquier duda.
Semilla del ángulo: "¡[Nombre]! ¿Cómo te ha tratado tu [auto]? Quería asegurarme de que todo esté perfecto con la entrega y los papeles."
PROHIBIDO: vender otro auto; pedir referidos todavía; sonar a encuesta corporativa.`,

    postventa_referidos: `POSTVENTA: REFERIDOS + RESEÑA (+30 días de la compra)
Estrategia: el cliente ya vivió la experiencia — es el momento de oro. Pregunta cómo va, y con naturalidad pide: (1) si conoce a alguien buscando auto, que te lo presente (lo cuidas igual), y (2) si le fue bien, una reseña en Google ayuda muchísimo.
Semilla del ángulo: "Me da gusto saber que ya llevas un mes con tu [auto]. Oye, si algún amigo o familiar anda buscando auto, preséntamelo con confianza — lo atiendo igual que a ti. Y si te fue bien conmigo, una reseña en Google me ayudaría un montón 🙏"
PROHIBIDO: condicionar nada a cambio de la reseña; presionar; pedir más de una vez en el mismo mensaje.`,

    postventa_servicio: `POSTVENTA: RECORDATORIO DE SERVICIO (+6 meses de la compra)
Estrategia: cuidado preventivo — a los ~6 meses toca revisar servicio/mantenimiento. Recuérdalo con tono de asesor que cuida su inversión, y ofrece ayudar a agendarlo si la agencia da servicio.
Semilla del ángulo: "[Nombre], ya van ~6 meses con tu [auto] 🚗 Es buena fecha para su servicio de mantenimiento — cuida tu garantía y el valor de reventa. ¿Ya lo tienes agendado?"
PROHIBIDO: alarmar con fallas; vender otro auto; inventar políticas de garantía.`,

    postventa_aniversario: `POSTVENTA: ANIVERSARIO DE COMPRA (+1 año)
Estrategia: felicítalo por su primer año con el auto, pregunta cómo le ha ido, y deja UNA puerta abierta suave: si algún día piensa en cambiarlo o alguien cercano busca auto, aquí estás.
Semilla del ángulo: "¡[Nombre], ya un año con tu [auto]! 🎉 ¿Cómo te ha tratado? Si algún día piensas en renovarlo o alguien cercano anda buscando, ya sabes dónde encontrarme."
PROHIBIDO: presionar a cambiar de auto; cotizar sin que pregunte; sonar a campaña masiva.`,
  }

  return `${businessContext}

ESTADO DEL LEAD:
- Nombre: ${contactName}
- Sin responder hace: ${daysSince} día(s)
- Resumen del contexto: ${contextSummary || 'Primera interacción'}
${leadFicha}
HISTORIAL DE CONVERSACION (ultimos mensajes):
${conversationHistory || 'Sin historial previo'}
${previousFollowUps ? `
SEGUIMIENTOS AUTOMÁTICOS YA ENVIADOS ANTES (⛔ PROHIBIDO repetir sus ideas, ángulos o frases — este mensaje debe sentirse COMPLETAMENTE distinto):
${previousFollowUps}
` : ''}

═══ INSTRUCCIONES DE MENSAJE ═══
${tipoInstructions[tipo]}

═══ REGLAS DE ORO ═══
- 🎯 RETOMA EL CONTEXTO PRIMERO: arranca el mensaje conectando con la conversación real — su nombre (si lo sabes) + UN dato específico que ÉL dio (ej. "los 70 prospectos que reciben al mes", el modelo que le interesó, su presupuesto). Un seguimiento sin contexto se siente masivo y no se contesta. Si el historial no tiene ningún dato del lead, entonces sé breve y genuino, sin fingir contexto.
- Corto, natural, conversacional. Como WhatsApp real.
- Tono: amigable, cercano, mexicano. Habla como asesor comercial.
- UNA sola idea. UNA sola acción.
- NUNCA repitas un mensaje anterior del historial.
- NUNCA suenes robot, desesperado o repetitivo.
- NUNCA presiones.
- NUNCA menciones que es un mensaje automatico.
- SIEMPRE aporta algo de valor en cada mensaje.
- Maximo 4 lineas + maximo 1 emoji.
- Termina con pregunta clara que invite respuesta (excepto reactivacion_final).
- Personaliza con datos reales del lead (producto actual, lo que busca, presupuesto).
- ⛔ PROHIBIDO COPIAR LOS EJEMPLOS: las frases de ejemplo de arriba (como "Te voy a ser honesto, sin compromiso...") son SOLO inspiración del ángulo. JAMÁS las escribas palabra por palabra. Redacta el mensaje DESDE CERO, con TUS propias palabras y las del cliente.
- 🔑 ÚNICO POR LEAD: dos clientes distintos JAMÁS deben recibir el mismo texto. Varía el inicio, las palabras y el ejemplo según ESTE lead. Si no puedes personalizarlo, hazlo más corto y genuino, pero nunca genérico ni idéntico a otro.

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
    // Timeline complete — lead is "perdido". Se DETIENE EN SILENCIO (sin
    // mensaje de despedida) y se marca desinteresado.
    await setContactFUState(contactId, { leadState: 'perdido' })
    await markDisinterested(contactId, workspaceId).catch(() => {})
    logWarn('FOLLOWUP', 'timeline_complete', { contactId, reason: 'Los 2 follow-ups (7/14d) se agotaron → Perdido (sin despedida)' })
    return null
  }

  // Enforce plan follow-up days limit
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } })
  const planDef = PLANS[workspace?.plan ?? 'free'] ?? PLANS['free']
  const config = FOLLOW_UP_TIMELINE[step]
  const stepDelayDays = config.delayMinutes / (60 * 24)
  if (stepDelayDays > planDef.limits.maxFollowUpDays) {
    logWarn('FOLLOWUP', 'plan_limit_reached', {
      contactId,
      step,
      stepDelayDays,
      maxFollowUpDays: planDef.limits.maxFollowUpDays,
      plan: workspace?.plan,
    })
    await setContactFUState(contactId, { leadState: 'perdido' })
    return null
  }

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
      scheduledAt: nextAt,
      metadata: JSON.stringify({ tipo: config.tipo, step: config.step, label: config.label, ...(config.longTail ? { longTail: true } : {}) }),
    },
  })

  // Update contact customFields with next follow-up info
  await setContactFUState(contactId, {
    nextFollowUpAt: nextAt.toISOString(),
    followUpStep: step,
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
  // EXENTAS: las de postventa (ruleId 'post-sale') — que el cliente responda
  // NO debe borrar su check-in/referidos/servicio/aniversario programados.
  const result = await db.followUpTask.updateMany({
    where: {
      contactId,
      status: { in: ['pending', 'processing'] },
      ruleId: { not: 'post-sale' },
    },
    data: { status: 'cancelled' },
  })

  // Reset contact follow-up state via customFields
  await setContactFUState(contactId, {
    followUpStep: 0,
    nextFollowUpAt: undefined,
    followUpPaused: false,
    followUpPauseUntil: undefined,
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
      await setContactFUState(contactId, {
        followUpPaused: true,
        followUpPauseUntil: pauseUntil.toISOString(),
      })
      // Cancel pending
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending', ruleId: { not: 'post-sale' } },
        data: { status: 'cancelled' },
      })
      logInfo('FOLLOWUP', 'paused_30d', { contactId, reason })
      break
    }
    case 'pause_60d': {
      const pauseUntil = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      await setContactFUState(contactId, {
        followUpPaused: true,
        followUpPauseUntil: pauseUntil.toISOString(),
      })
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending', ruleId: { not: 'post-sale' } },
        data: { status: 'cancelled' },
      })
      logInfo('FOLLOWUP', 'paused_60d', { contactId, reason })
      break
    }
    case 'close_won': {
      await setContactFUState(contactId, {
        leadState: 'cerrado',
        followUpPaused: true,
      })
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending', ruleId: { not: 'post-sale' } },
        data: { status: 'cancelled' },
      })
      logOk('FOLLOWUP', 'closed_won', { contactId, reason })
      break
    }
    case 'close_lost': {
      await setContactFUState(contactId, { leadState: 'perdido', followUpPaused: true })
      await db.followUpTask.updateMany({
        where: { contactId, status: 'pending', ruleId: { not: 'post-sale' } },
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

TAREA: Resume en MÁXIMO 3 frases la conversación con un prospecto de compra. Incluye:
1. Qué producto tiene actualmente y qué quiere cambiar (características)
2. Presupuesto mencionado (pago inicial, mensualidad, precio total)
3. En qué se quedó la conversación (agendó visita, pidió planes de pago, no respondió, etc.)
4. Objeciones detectadas (precio, condición, garantía, plazo, etc.)
5. Nivel de interés: alto / medio / bajo

FORMATO: Solo el resumen, sin etiquetas, sin viñetas, sin formato. Texto continuo.`,
      },
      { role: 'user', content: history },
    ], 'glm', undefined, { temperature: 0.3, maxTokens: 300 })

    return result.content.trim()
  } catch (err) {
    logError('FOLLOWUP', 'context_summary_failed', err, { contactId })
    return ''
  }
}

/**
 * Extract the final WhatsApp-ready message from a possibly verbose AI response.
 * Some reasoning models return chain-of-thought before the actual message.
 * Strategies (in priority order):
 *   1. Short clean response → return as-is
 *   2. "Option 1:" pattern → extract first option text
 *   3. Last quoted string in the response
 *   4. Last Spanish-language paragraph
 *   5. Last non-empty line
 */
function extractFollowUpMessage(raw: string): string {
  const text = raw.trim()

  // Short and clean — no reasoning markers → return as-is
  if (
    text.length <= 280 &&
    !/^(We are|Let'?s|The context|Given that|I need to|Based on|To generate|Since the|Important:|However)/i.test(text)
  ) {
    return text
  }

  // Pattern: "Option 1:" → extract the text of the first option (strip surrounding quotes)
  const opt1 = text.match(/Option\s*1[^:\n]*:\s*[«"\u201c\u201d]?([^\n«"\u201c\u201d]{10,280})[«»"\u201c\u201d]?/i)
  if (opt1) return opt1[1].trim().replace(/^["«»\u201c\u201d']+|["«»\u201c\u201d']+$/g, '')

  // Pattern: last quoted string in curly or straight quotes
  const quotedAll = [...text.matchAll(/["«\u201c\u201d]([^"«\u201c\u201d\n]{15,280})["»\u201c\u201d]/g)]
  if (quotedAll.length > 0) return quotedAll[quotedAll.length - 1][1].trim()

  // Pattern: last Spanish-language short paragraph
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i]
    if (
      p.length >= 10 && p.length <= 320 &&
      /[¿¡áéíóúüñÁÉÍÓÚÜÑ]/i.test(p) &&
      !/^(Option|We are|Let|Given|The context|Based on|Important)/i.test(p)
    ) {
      return p
    }
  }

  // Last non-empty line fallback
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5)
  return (lines[lines.length - 1] || text).replace(/^["«»\u201c\u201d']+|["«»\u201c\u201d']+$/g, '')
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

  // ── FICHA DEL LEAD (Motor Inteligente): todo lo que el sistema SABE de él
  // para que el mensaje se construya con SUS variables reales — nombre, giro,
  // interés, presupuesto, objeción, score, campaña de origen, días sin responder.
  let leadFicha = ''
  try {
    const [profile, lastInbound] = await Promise.all([
      db.leadProfile.findFirst({ where: { contactId } }),
      db.message.findFirst({
        where: { conversationId, direction: 'inbound' },
        orderBy: { createdAt: 'desc' }, select: { content: true, createdAt: true },
      }),
    ])
    const cf = (() => { try { return JSON.parse(contact.customFields || '{}') } catch { return {} } })() as Record<string, unknown>
    const tags = (() => { try { return JSON.parse(contact.tags || '[]') } catch { return [] } })() as string[]
    const diasSinRespuesta = lastInbound ? Math.floor((Date.now() - lastInbound.createdAt.getTime()) / 86400000) : null
    const lines = [
      profile?.archetype && profile.archetype !== 'desconocido' ? `- Arquetipo del cliente: ${profile.archetype}` : '',
      profile?.preferredProduct ? `- Producto/vehículo de interés: ${profile.preferredProduct}` : '',
      profile?.budget ? `- Presupuesto detectado: ${profile.budget}` : '',
      profile?.mainObjection ? `- Objeción principal: ${profile.mainObjection}` : '',
      profile ? `- Lead score: ${profile.score ?? contact.leadScore} · Temperatura: ${profile.temperature || contact.temperature}` : `- Lead score: ${contact.leadScore} · Temperatura: ${contact.temperature}`,
      cf.adSource ? `- Llegó desde el anuncio/campaña: "${String(cf.adSource).slice(0, 120)}"` : '',
      contact.source ? `- Canal de origen: ${contact.source}` : '',
      tags.length ? `- Etiquetas: ${tags.slice(0, 6).join(', ')}` : '',
      diasSinRespuesta !== null ? `- Días sin responder: ${diasSinRespuesta}` : '',
      lastInbound?.content ? `- ÚLTIMO mensaje que ÉL escribió (su tema/pregunta pendiente): "${lastInbound.content.slice(0, 160)}"` : '',
    ].filter(Boolean)
    if (lines.length) leadFicha = `\nFICHA DEL LEAD (datos REALES — úsalos para personalizar; JAMÁS inventes los que falten):\n${lines.join('\n')}\n`
  } catch { /* la ficha nunca bloquea la generación */ }

  // ── Anti-repetición de IDEAS: los últimos seguimientos automáticos que ya
  // recibió — el nuevo mensaje debe cambiar de ángulo por completo.
  let previousFollowUps = ''
  try {
    const prevAuto = await db.message.findMany({
      where: {
        conversationId, direction: 'outbound',
        OR: [
          { metadata: { contains: 'followup-worker' } },
          { metadata: { contains: 'cron_follow_up' } },
          { metadata: { contains: 'dib-reactivation' } },
          { metadata: { contains: '"automated":true' } },
        ],
      },
      orderBy: { createdAt: 'desc' }, take: 3, select: { content: true },
    })
    previousFollowUps = prevAuto.map((m, i) => `${i + 1}. "${m.content.slice(0, 180)}"`).join('\n')
  } catch { /* opcional */ }

  // Build prompt
  const fuState = await getContactFUState(contactId)
  const prompt = buildFollowUpPrompt(
    tipo,
    businessContext,
    contactName,
    history,
    fuState.contextSummary || '',
    minutesSince,
    leadFicha,
    previousFollowUps
  )

  // Generate message — use glm-4-flash (non-reasoning model) to avoid leaking
  // chain-of-thought into the WhatsApp message. Add explicit user turn so the
  // model knows when to produce its response (system-only calls cause reasoning leak).
  const result = await chatWithAI(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Genera el mensaje ahora.' },
    ],
    'glm',
    'glm-4-flash',
    { temperature: 0.9, maxTokens: 300 }
  )

  const cleanMessage = extractFollowUpMessage(result.content)
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
 * CONDICIONES DURAS DE PARO (política de Jhon 2026-07-15): lo único que
 * detiene la COLA LARGA mensual. El tag 'desinteresado' NO cuenta aquí —
 * es precisamente a quien la cola larga mantiene "presente sin invadir".
 *
 * opts.postSale (2026-07-20): las tareas de POSTVENTA (ruleId 'post-sale')
 * van dirigidas a quien YA COMPRÓ, así que "ya es cliente" / "lead cerrado"
 * NO las detienen — solo IA apagada, pausa y noqualify.
 */
export async function hardStopFollowUps(contactId: string, opts?: { postSale?: boolean }): Promise<{ stop: boolean; reason?: string }> {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { customFields: true, tags: true, status: true },
  })
  if (!contact) return { stop: true, reason: 'contacto no existe' }
  let cf: Record<string, unknown> = {}
  try { cf = JSON.parse(contact.customFields || '{}') } catch { /* */ }
  const fu = (cf.followUp || {}) as FollowUpContactState
  let tags: string[] = []
  try { tags = JSON.parse(contact.tags || '[]') } catch { /* */ }
  if (cf.aiDisabled) return { stop: true, reason: 'IA apagada para el contacto' }
  if (fu.followUpPaused) {
    const until = fu.followUpPauseUntil ? new Date(fu.followUpPauseUntil) : null
    if (!until || until > new Date()) return { stop: true, reason: 'pausado por edge-case (no molestar / lo pensará)' }
  }
  if (!opts?.postSale) {
    if (fu.leadState === 'cerrado') return { stop: true, reason: 'lead cerrado (ya compró)' }
    if (tags.includes('cliente')) return { stop: true, reason: 'ya es cliente' }
    // FUENTE DE VERDAD: si el contacto tiene un TRATO GANADO (status='won' O en
    // una etapa marcada isWon), NO se le manda seguimiento de ventas — aunque la
    // etiqueta 'cliente' o el leadState no se hayan sincronizado (bug real
    // 2026-07-21: Eduardo, ganado en el tablero pero status='active', recibió
    // seguimiento). El trato ganado es la señal definitiva de "ya compró".
    try {
      const wonDeal = await db.deal.findFirst({
        where: { contactId, OR: [{ status: 'won' }, { stage: { isWon: true } }] },
        select: { id: true },
      })
      if (wonDeal) return { stop: true, reason: 'tiene un trato ganado (ya compró)' }
    } catch { /* si falla la consulta, no bloquea el resto de guards */ }
    // CITA AGENDADA (pedido de Jhon 2026-07-22): si el prospecto YA tiene una cita
    // próxima pendiente/confirmada, NO se le manda seguimiento de rescate — ya está
    // enganchado y una demo está en el calendario. Al pasar/cancelarse la cita, el
    // freno deja de aplicar y el seguimiento puede retomarse.
    try {
      const appt = await db.appointment.findFirst({
        where: { contactId, status: { in: ['pending', 'confirmed'] }, date: { gte: new Date() } },
        select: { id: true },
      })
      if (appt) return { stop: true, reason: 'tiene una cita agendada' }
    } catch { /* no bloquea el resto */ }
  }
  if (tags.some(t => t.startsWith('noqualify'))) return { stop: true, reason: 'descartado (spam/no califica)' }
  return { stop: false }
}

/**
 * REACTIVACIÓN DE CARTERA (disparada por el gerente vía Copiloto: "reactiva
 * mi cartera"). En vez de mandar unos pocos mensajes síncronos y ahogarse en
 * el timeout del request, INSCRIBE a los contactos elegibles en la escalera
 * autónoma: crea el paso 0 (un re-opener personalizado por IA) escalonado en
 * el tiempo y respetando el horario nocturno; el worker envía y avanza la
 * escalera solo por días. Devuelve SOLO conteos (nunca la lista de nombres,
 * para no inundar el contexto del Copiloto).
 *
 * - Filtra con hardStopFollowUps (omite ya-clientes/ganados/con cita/IA
 *   apagada/opt-out): exactamente el "a quién NO escribir" que se pide.
 * - Omite a quien YA tiene un seguimiento activo (no lo duplica).
 * - El opener lleva `reactivation:true` para saltarse el freno de "N sin
 *   respuesta" SOLO en el primer mensaje (decisión deliberada del gerente);
 *   del paso 1 en adelante el freno vuelve a aplicar.
 */
export async function enrollPortfolioReactivation(
  workspaceId: string,
  opts: { contactIds?: string[]; limit?: number; spacingSeconds?: number } = {},
): Promise<{ total: number; enrolled: number; skipped: number; reasons: Record<string, number>; firstAt: Date | null; lastAt: Date | null }> {
  const spacingMs = Math.max(30, opts.spacingSeconds ?? 120) * 1000

  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  let wsSettings: Record<string, unknown> = {}
  try { wsSettings = JSON.parse(ws?.settings || '{}') } catch { /* */ }

  const where: Record<string, unknown> = { workspaceId, status: 'active', phone: { not: null } }
  if (opts.contactIds?.length) where.id = { in: opts.contactIds }
  const candidates = await db.contact.findMany({
    where,
    select: { id: true, phone: true },
    orderBy: { lastMessageAt: 'asc' }, // los más callados primero
    ...(opts.limit ? { take: Math.max(1, opts.limit) } : {}),
  })

  const reasons: Record<string, number> = {}
  const bump = (r: string) => { reasons[r] = (reasons[r] || 0) + 1 }

  let rule = await db.followUpRule.findFirst({ where: { workspaceId, isActive: true }, select: { id: true } })
  if (!rule) {
    rule = await db.followUpRule.create({
      data: { workspaceId, name: 'Auto Follow-Up Engine', description: 'Reactivación de cartera', triggerType: 'inactivity', isActive: true, messageTemplate: '' },
    })
  }

  const firstAllowed = nextAllowedSend(new Date(), wsSettings)
  let enrolled = 0
  let lastAt: Date | null = null

  for (const c of candidates) {
    if (!c.phone) { bump('sin teléfono'); continue }
    const hard = await hardStopFollowUps(c.id)
    if (hard.stop) { bump(hard.reason || 'no elegible'); continue }
    const active = await db.followUpTask.count({ where: { contactId: c.id, status: { in: ['pending', 'processing', 'awaiting_approval'] } } })
    if (active > 0) { bump('ya en seguimiento'); continue }
    const convo = await db.conversation.findFirst({ where: { workspaceId, contactId: c.id }, orderBy: { lastMessageAt: 'desc' }, select: { id: true } })
    if (!convo) { bump('sin conversación'); continue }

    const scheduledAt = new Date(firstAllowed.getTime() + enrolled * spacingMs)
    await db.followUpTask.create({
      data: {
        workspaceId,
        ruleId: rule.id,
        contactId: c.id,
        conversationId: convo.id,
        status: 'pending',
        scheduledAt,
        metadata: JSON.stringify({ tipo: 'reactivacion_emocional', step: 0, label: 'Reactivación de cartera', reactivation: true }),
      },
    })
    await setContactFUState(c.id, { nextFollowUpAt: scheduledAt.toISOString(), followUpStep: 0 })
    enrolled++
    lastAt = scheduledAt
  }

  logOk('FOLLOWUP', 'portfolio_reactivation_enrolled', { workspaceId, total: candidates.length, enrolled, skipped: candidates.length - enrolled })
  return { total: candidates.length, enrolled, skipped: candidates.length - enrolled, reasons, firstAt: enrolled ? firstAllowed : null, lastAt }
}

/**
 * TRANSICIÓN A COLA LARGA: cuando la ráfaga inicial se topa con el freno
 * (N sin respuesta), en vez de morir el seguimiento pasa a modo mensual.
 * Agenda el primer paso longTail posterior a `fromStep`.
 */
export async function scheduleLongTailEntry(
  contactId: string,
  workspaceId: string,
  conversationId: string,
  fromStep = -1
): Promise<{ success: boolean; step?: number } | null> {
  const hard = await hardStopFollowUps(contactId)
  if (hard.stop) {
    logInfo('FOLLOWUP', 'longtail_skipped_hardstop', { contactId, reason: hard.reason })
    return null
  }
  const entry = FOLLOW_UP_TIMELINE.find(s => s.longTail && s.step > fromStep)
  if (!entry) return null
  const existing = await db.followUpTask.count({ where: { contactId, status: 'pending' } })
  if (existing > 0) return null
  const r = await scheduleNextFollowUp(contactId, workspaceId, conversationId, entry.step)
  if (r?.success) logOk('FOLLOWUP', 'longtail_entered', { contactId, step: entry.step, label: entry.label })
  return r
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
  const fuState = await getContactFUState(contactId)

  // ── Guard: terminal states ──
  if (fuState.leadState === 'cerrado' || fuState.leadState === 'perdido') {
    logInfo('FOLLOWUP', 'timeline_skipped_terminal', {
      contactId,
      leadState: fuState.leadState,
    })
    return
  }

  // ── Guard: paused lead ──
  if (fuState.followUpPaused) {
    // Check if pause period ended
    const pauseUntil = fuState.followUpPauseUntil ? new Date(fuState.followUpPauseUntil) : null
    if (pauseUntil && pauseUntil <= new Date()) {
      // Auto-resume: clear pause flags
      await setContactFUState(contactId, { followUpPaused: false, followUpPauseUntil: undefined })
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
    leadState: fuState.leadState || 'nuevo',
  })
}
