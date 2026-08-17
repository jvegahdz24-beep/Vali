// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Revenue Engine
// Full 9-step pipeline: Analyze → Trigger → Decide → Objection →
// Generate → Follow-up → CRM → Route → Deliver
// ═══════════════════════════════════════════════════════════════

import type {
  LeadAnalysis,
  RevenueEngineDecision,
  JHONResponse,
  CRMUpdate,
  FollowUpTaskConfig,
  AgentRoutingDecision,
  Channel,
} from '@/lib/types'
import { chatWithAI } from './providers'
import { detectIntent, AgentRouter } from './agent-router'
import { getSystemPrompt, type WorkspaceContext } from './personalities'

// ─── Spanish NFD Normalization ───────────────────────────────

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

// Saneador anti-fuga: quita razonamiento/planeaci\u00f3n que algunos modelos (MiniMax)
// filtran antes del mensaje real. Conserva el texto si no hay nada que cortar.
// ¿El texto del CLIENTE está en inglés? (stopwords EN dominan sobre ES).
// Se usa para PERMITIR respuestas en inglés cuando el cliente escribe en
// inglés — antes el saneador las descartaba SIEMPRE (anti-fuga de reasoning)
// y el bot quedaba mudo con turistas/extranjeros (fix 2026-07-20).
export function clientWritesEnglish(text: string): boolean {
  const t = (text || '').toLowerCase()
  if (!t || t.length < 8) return false
  const en = (t.match(/\b(the|is|are|do|does|you|your|i|we|have|want|need|can|could|would|price|available|how|much|what|when|where|hello|hi|thanks|please|looking|for|car|truck|buy)\b/g) || []).length
  const es = (t.match(/\b(el|la|los|las|que|de|para|con|una|un|por|como|cuanto|cuánto|hola|gracias|quiero|busco|precio|disponible|auto|carro|camioneta)\b/g) || []).length
  return en >= 3 && en > es * 2
}

export function sanitizeLLMReply(raw: string, opts?: { allowEnglish?: boolean }): string {
  let t = (raw || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()
  // ECO DE BLOQUES INTERNOS DEL PROMPT (fuga grave): M3 a veces degenera y
  // recita fragmentos del system prompt ("FECHA Y HORA ACTUAL…", "PERFIL DEL
  // LEAD (DIB Intelligence)…", "⚠️ PREGUNTAS YA HECHAS…") revueltos en la
  // respuesta. Esos marcadores JAMÁS deben llegar al cliente: si aparecen, se
  // rescata solo la cola posterior al último marcador; sin cola limpia se
  // descarta todo → el caller usa su fallback seguro.
  const promptEcho = /(FECHA Y HORA ACTUAL|PERFIL DEL LEAD|DIB Intelligence|PREGUNTAS YA HECHAS|PREGUNTA HECHA|ESTADO DE LA CONVERSACI[OÓ]N|LECCIONES DEL VENDEDOR|EJEMPLOS DE BUENAS RESPUESTAS|FORMATO DE RESPUESTA OBLIGATORIO|CONTEXTO DEL NEGOCIO|INSTRUCCI[OÓ]N DE ETAPA|zona del negocio,)/i
  if (promptEcho.test(t)) {
    const ls = t.split('\n')
    let last = -1
    for (let i = 0; i < ls.length; i++) if (promptEcho.test(ls[i])) last = i
    const tail = ls.slice(last + 1).join('\n').trim()
    if (tail.length >= 40 && !promptEcho.test(tail)) t = tail
    else return ''
  }
  // L\u00edneas de meta/planeaci\u00f3n (ingl\u00e9s o espa\u00f1ol) que algunos modelos anteponen.
  const meta = /^\s*[-*\u2022=]{0,3}\s*(stage|etapa|strategy|estrategia|an[a\u00e1]lisis|analysis|plan|reasoning|razonamiento|output|respuesta|the smartest|the best|the most|here'?s|for (?:the )?payment|i (?:will|should|am|need)|let me|first[,:]|step\s*\d|note:|context:|given\b|since\s+(?:she|he|they|the user)|acknowledge|she'?s|he'?s|they'?re|the user|we (?:should|need|could)|but (?:the|she|he))/i
  // Ecos del historial de contexto: "2026-06-23 20:06 - User: ..." / "- Assistant:"
  const historyEcho = /^\s*[-\u2022]?\s*(\d{4}-\d{2}-\d{2}[\sT]|user:|assistant:|cliente:|bot:)/i
  // Plan/imperativo en ingl\u00e9s con n\u00famero o vi\u00f1eta: "1. Confirm the Versa",
  // "- Share price from inventory", "\u2022 Ask for the down payment".
  const enPlan = /^\s*(?:\d+[.)]|[-*\u2022])\s+(confirm|check|ask|offer|provide|present|calculate|generate|share|show|tell|give|explain|note|mention|highlight|since|the user|first|next|then|propose|suggest|acknowledge|respond|reply|keep|use|avoid)\b/i
  // Ecos de campos del bloque de an\u00e1lisis interno: "- temp: cold", "- score: 45",
  // "- Total cost: $...", "- Pr\u00f3xima acci\u00f3n: ...".
  const analysisField = /^\s*[-*\u2022]?\s*(temp(?:erature)?|score|intent|intenci[o\u00f3]n|stage|etapa|se[\u00f1n]ales|signals|buying\s*signals?|objection|objeci[o\u00f3]n|pr[o\u00f3]xima\s*acci[o\u00f3]n|next\s*action|total\s*cost|subtotal|total)\s*:/i
  // Delimitadores entre corchetes que el modelo a veces recita ("[FIN DEL
  // CONTEXTO]"). NO toca [CRM:...] (lo necesita el parser de citas/pagos).
  const delimiter = /^\s*\[(?!CRM)[^\]]*\]\s*$/i
  // L\u00edneas que son solo c\u00e1lculo/s\u00edmbolos sueltos: "= 309,000 *", "= 309000 * 0.16"
  const mathOnly = /^\s*[-=*+/().,\d\s$%x]+\s*$/i
  // Con cliente en inglés, `meta` y `enPlan` (que cazan RAZONAMIENTO en inglés)
  // destruirían una respuesta legítima — se relajan solo en ese caso.
  const isJunk = (l: string) =>
    l.trim() === '' || (!opts?.allowEnglish && meta.test(l)) || historyEcho.test(l) ||
    (!opts?.allowEnglish && enPlan.test(l)) ||
    analysisField.test(l) || delimiter.test(l) || (mathOnly.test(l) && /[=*/]/.test(l))
  const lines = t.split('\n')
  // Permite eliminar TODAS las l\u00edneas: si el reply completo es meta/plan, mejor
  // devolver vac\u00edo (el caller usa un fallback limpio) que filtrar "- Stage:".
  while (lines.length > 0 && isJunk(lines[0])) lines.shift()
  // Tambi\u00e9n barre basura al final (ej. "...\u00a1Hola!\n- temp: cold").
  while (lines.length > 0 && isJunk(lines[lines.length - 1])) lines.pop()
  let cleaned = lines.join('\n').trim()
  // Quita un fragmento de tag CRM truncado o corchete suelto al final.
  cleaned = cleaned.replace(/\s*\[(?:CRM)?[^\]]*$/i, '').trim()
  // Negritas Markdown del modelo (**texto** / __texto__): WhatsApp no las
  // entiende (usa *texto*) y en la bandeja se ven los asteriscos literales
  // (visto en producción con Donovan 2026-07-14). Se quitan AQUÍ para que el
  // texto guardado en el CRM y el enviado al cliente sean el mismo y limpios.
  cleaned = cleaned.replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
  // Fuga de caracteres CHINOS del modelo (MiniMax es modelo chino y a veces
  // cuela tokens CJK: "con más 跟进 involucrados" — visto en producción
  // 2026-07-13). Se eliminan y se repara el espaciado.
  if (/[㐀-鿿豈-﫿]/.test(cleaned)) {
    cleaned = cleaned
      .replace(/[　-〿㐀-鿿豈-﫿！-～]+/g, '')
      .replace(/ {2,}/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim()
  }
  // Red de seguridad: si la respuesta qued\u00f3 DOMINADA por ingl\u00e9s (MiniMax a veces
  // ignora el "responde en espa\u00f1ol" y razona/contesta en ingl\u00e9s), desc\u00e1rtala \u2192
  // el caller usa un fallback en espa\u00f1ol. Las stopwords inglesas no aparecen en
  // espa\u00f1ol, as\u00ed que un nombre de modelo en ingl\u00e9s no dispara esto.
  const en = (cleaned.match(/\b(the|is|are|you|your|with|for|and|that|this|would|could|here|let|write|response|since|makes|sense|the user|wants|best|option|affordable|naturally|professionally|i'?ll|we'?ll)\b/gi) || []).length
  const es = (cleaned.match(/\b(el|la|los|las|que|de|para|con|tu|tus|te|un|una|por|est[a\u00e1]|qu[e\u00e9]|s[i\u00ed]|gracias|hola|puedo|quieres|auto|coche|cita|mejor|opci[o\u00f3]n|precio|enganche|mensualidad|gusto|claro|veas)\b/gi) || []).length
  // Si el CLIENTE escribe en ingl\u00e9s, la respuesta en ingl\u00e9s es CORRECTA \u2014 no descartarla.
  if (!opts?.allowEnglish && en >= 4 && en > es) return ''
  // Si NO hab\u00eda nada que limpiar Y no es ingl\u00e9s, regresa el original tal cual.
  if (cleaned === t) return t
  // Si tras limpiar qued\u00f3 vac\u00edo o irrelevante, se\u00f1ala vac\u00edo \u2192 fallback limpio.
  return cleaned.length >= 2 ? cleaned : ''
}

// ─── Keyword Categories (General Sales) ─────────────────

const KEYWORD_CATEGORIES = {
  // Budget & Financial
  budget: {
    keywords: [
      'pago inicial', 'anticipo', 'inicial', 'separar', 'apartar', 'reservar',
      'planes de financiamiento', 'credito', 'prestamo', 'msi', 'meses sin intereses',
      'mensualidad', 'cuota', 'cat', 'tasa', 'interes', 'pagare',
      'buro', 'buero', 'aprobacion', 'solicitad', 'capacidad de pago',
      'ingresos', 'comprobante', 'afore', 'infonavit', 'pension',
    ],
    weight: 1.4,
  },

  // Urgency / Timing
  urgency: {
    keywords: [
      'ya', 'ahora', 'hoy', 'urgente', 'necesito', 'rapido', 'inmediato',
      'semana que entra', 'lo antes posible', 'que tenga', 'disponible',
      'cuando', 'mañana', 'este mes', 'antes de', 'se acaba', 'ultima unidad',
      'promocion termina', 'oferta', 'descuento',
    ],
    weight: 1.3,
  },

  // Product Interest
  modelInterest: {
    keywords: [
      'producto', 'servicio', 'plan', 'paquete', 'solucion', 'opcion',
      'basico', 'estandar', 'premium', 'vip', 'elite', 'gold', 'silver',
      'empresarial', 'personal', 'familiar', 'profesional',
      'consultoria', 'asesoria', 'capacitacion', 'curso', 'taller',
      'software', 'plataforma', 'sistema', 'app', 'pagina', 'tienda',
      'suscripcion', 'membresia', 'licencia', 'contrato',
      'pro', 'max', 'plus', 'lite', 'start', 'basic',
      'personalizado', 'a medida', 'dorado', 'plata', 'bronce',
      'digital', 'fisico', 'hibrido',
      'automotriz', 'inmobiliario', 'tecnologico', 'financiero',
      'terraza', 'jardin', 'vista', 'esquina', 'centro',
      'garantia', 'soporte', 'instalacion', 'entrega',
    ],
    weight: 1.1,
  },

  // Buy Signals
  buySignals: {
    keywords: [
      'lo tomo', 'me lo llevo', 'compro', 'lo compro', 'vamos', 'trato hecho',
      'cerramos', 'lo quiero', 'comprar', 'adquirir', 'mejor precio',
      'que necesito', 'requisitos', 'documentos', 'cuanto pago inicial',
      'cuota mensual', 'meses', 'plazo', 'años', 'a 48 meses',
      'visitar', 'ir', 'pasar', 'cita', 'agendar', 'demostracion',
      'reunion', 'donde estan', 'sucursal',
      'direccion', 'ubicacion', 'que horario',
    ],
    weight: 1.5,
  },

  // Objections
  objections: {
    price: [
      'muy caro', 'carisimo', 'no tengo dinero', 'no me alcanza', 'fuera de presupuesto',
      'costoso', 'no puedo pagar', 'no me sale', 'es mucho dinero',
      'barato', 'mas barato', 'otro lugar', 'competencia', 'mejor precio',
      'igual o menos', 'mas economico',
    ],
    time: [
      'lo voy a pensar', 'despues', 'mas tarde', 'no es buen momento',
      'no ahora', 'mas adelante', 'cuando tenga tiempo', 'ya vere',
      'luego lo veo', 'no tengo prisa', 'tengo que esperar',
    ],
    partner: [
      'mi esposa', 'mi esposo', 'mi pareja', 'mi familia', 'tengo que preguntar',
      'consultar', 'hablar con', 'deciden juntos', 'la dueña', 'el dueño',
      'no decido yo', 'tengo que hablar',
    ],
  },

  // Engagement
  engagement: {
    keywords: [
      'si', 'claro', 'exacto', 'correcto', 'perfecto', 'interesante',
      'cuentame', 'explícame', 'que mas', 'ademas', 'tambien',
      'gracias', 'genial', 'excelente', 'ok', 'vale', 'bien',
      'entiendo', 'tiene razon', 'me convence', 'suena bien',
      'me gusta', 'me interesa', 'quisiera', 'podria',
    ],
    weight: 1.0,
  },

  // Trust / Authority
  trust: {
    keywords: [
      'me recomendaron', 'mi amigo', 'mi familiar', 'conozco a alguien',
      'vi en facebook', 'vi en google', 'reviews', 'calificaciones',
      'confiable', 'garantia', 'seguro', 'confianza', 'recomendacion',
      'opiniones', 'referencia',
    ],
    weight: 1.1,
  },
} as const

// ─── Intent Types (LLM Classifier) ──────────────────────────

// Las 7 intenciones EXACTAS del spec. Sin OTRO: el fallback es 'info'.
export type IntentEnum =
  | 'compra'
  | 'credito'
  | 'cita'
  | 'info'
  | 'queja'
  | 'reclamo'
  | 'saludo'

export type SentimentEnum =
  | 'POSITIVO'
  | 'NEUTRAL'
  | 'FRUSTRADO'
  | 'ENOJADO'
  | 'URGENTE'

// ─── Keyword fallback for intent ─────────────────────────────

function classifyIntentByKeywords(message: string): IntentEnum {
  const m = normalize(message)
  // compra — intención comercial directa (gana sobre un saludo inicial)
  if (/quiero comprar|lo tomo|me lo llevo|cerramos|hagamoslo|procedemos|comprar/.test(m)) return 'compra'
  // credito — financiamiento
  if (/credito|prestamo|financiamiento|solicitud|buro|mensualidad|enganche|a meses|dan financ/.test(m)) return 'credito'
  // cita — agendar / visitar
  if (/cita|agendar|visitar|demo|cuando puedo|horario|reunion|reunirnos/.test(m)) return 'cita'
  // reclamo — disputa concreta (dinero, cargo, factura) — más fuerte que una queja genérica
  if (/me cobraron|cobro indebido|cobro de mas|cargo|reembolso|devoluci|factura mal|cobro doble|no reconozco el cargo/.test(m)) return 'reclamo'
  // queja — inconformidad general
  if (/queja|mal servicio|inconforme|problema|error|no funciona|pesimo/.test(m)) return 'queja'
  // info — precio / cotización / información (NO avanza a cierre)
  if (/precio|cuanto cuesta|cotizacion|costo|presupuesto|cuanto vale|informacion|como funciona|que incluye|que es/.test(m)) return 'info'
  // saludo — solo si el mensaje es esencialmente un saludo (no traía intención)
  if (/^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|que tal|que onda|saludos|hey|hi|hello)\b/.test(m) && m.length < 30) return 'saludo'
  // Fallback del spec: info
  return 'info'
}

// ─── Event-based lead scoring (spec Paso 3) ──────────────────
// Incrementos EXACTOS del spec, aplicados de forma aditiva sobre el
// score previo del contacto:
//   mensaje (cualquiera)        +5
//   pregunta por precio         +10
//   pide cita                   +15
//   comparte datos de contacto  +20  (email / teléfono / RFC)
//   abre link de cotización     +10  (ctx.openedQuoteLink)
//   "no me interesa"            −30
// (El "no responde en 3 días −10" es temporal y se aplica en el cron.)
export function computeLeadScoreDelta(
  message: string,
  ctx?: { openedQuoteLink?: boolean }
): number {
  const m = normalize(message)
  let delta = 5 // cualquier mensaje entrante
  if (/precio|cuanto cuesta|cotizacion|costo|presupuesto|cuanto vale/.test(m)) delta += 10
  if (/cita|agendar|visitar|demo|cuando puedo|horario|reunion|reunirnos/.test(m)) delta += 15
  // Comparte datos de contacto: email, teléfono (10 dígitos) o RFC mexicano
  const compact = message.replace(/[\s-]/g, '')
  const sharesContact =
    /[\w.+-]+@[\w-]+\.[\w.-]+/.test(message) ||
    /\b\d{10}\b/.test(compact) ||
    /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/i.test(message)
  if (sharesContact) delta += 20
  if (ctx?.openedQuoteLink) delta += 10
  if (/no me interesa|ya no me interesa|no estoy interesad|no gracias|ya no quiero/.test(m)) delta -= 30
  return delta
}

// ─── Intent → acción esperada (spec Paso 1) ──────────────────
// Directiva que se inyecta en el prompt según la intención clasificada,
// para que el bot ejecute la "acción esperada" de cada categoría.
const INTENT_ACTION_GUIDE: Record<IntentEnum, string> = {
  compra:
    'El cliente quiere COMPRAR. Avanza al CIERRE: confirma plan/precio, pide los datos fiscales (RFC) y genera el link de pago. Emite [CRM:pago:monto|concepto] cuando acepte. NO hagas más preguntas de diagnóstico.',
  credito:
    'El cliente pregunta por FINANCIAMIENTO. Ofrece opciones de crédito, calcula mensualidad/enganche y califica. No saltes al cierre sin antes resolver el plan de pago.',
  cita:
    'El cliente quiere AGENDAR. Ofrece 2 horarios concretos y confirma. Usa [CRM:appt_propose:...] al ofrecer y [CRM:appointment:...] cuando confirme.',
  info:
    'El cliente pide INFORMACIÓN/precio. Da la info de forma clara, pero NO avances al cierre todavía: genera más interés y haz una micro-pregunta. No presiones.',
  queja:
    'El cliente tiene una QUEJA. Discúlpate con empatía, NO vendas, y escala a un humano (el sistema ya alertó al equipo). Registra el caso.',
  reclamo:
    'El cliente tiene un RECLAMO (dinero/cargo/factura). Escala a un humano de inmediato (el sistema ya alertó), NO vendas, y ofrece revisar el cargo y dar solución.',
  saludo:
    'El cliente SALUDÓ. Responde cordialmente y pregunta en qué puedes ayudar. Preséntate SOLO si es el primer mensaje de la conversación; si la plática ya venía en curso NO te vuelvas a presentar, solo continúa con naturalidad. NO envíes cotización, precios ni propuestas todavía.',
}

/** Directiva de acción esperada para la intención clasificada (spec Paso 1). */
export function buildIntentActionDirective(intent: IntentEnum): string {
  const guide = INTENT_ACTION_GUIDE[intent] || INTENT_ACTION_GUIDE.info
  return `INTENCIÓN DETECTADA: ${intent.toUpperCase()} — ACCIÓN ESPERADA: ${guide}`
}

function classifySentimentByKeywords(message: string): SentimentEnum {
  const m = normalize(message)
  if (/urgente|necesito ya|lo necesito hoy|es urgente|para hoy/.test(m)) return 'URGENTE'
  if (/molesto|enojado|harto|pesimo|mal servicio|estafa|mentira|no sirve/.test(m)) return 'ENOJADO'
  if (/no me gusta|decepcionado|mal|tardo mucho|no respondieron/.test(m)) return 'FRUSTRADO'
  if (/gracias|excelente|perfecto|genial|me gusta|bueno|correcto|listo/.test(m)) return 'POSITIVO'
  return 'NEUTRAL'
}

// ─── Revenue Engine Class ────────────────────────────────────

export class RevenueEngine {
  private router = new AgentRouter()

  // ═════════════════════════════════════════════════════════════
  // MODULE 1: LLM Intent Classifier
  // ═════════════════════════════════════════════════════════════

  async classifyIntent(
    message: string,
    apiKey?: string
  ): Promise<IntentEnum> {
    const keyword = classifyIntentByKeywords(message)

    // Only call LLM if keyword is ambiguous (fell back to 'info')
    if (keyword !== 'info') return keyword

    try {
      const prompt = `Clasifica la siguiente consulta de un cliente potencial en UNA de estas 7 categorías exactas:
compra, credito, cita, info, queja, reclamo, saludo

Notas: saludo = solo saluda sin pedir nada. info = pregunta precio o información. compra = quiere comprar. credito = financiamiento. cita = agendar. queja = inconformidad general. reclamo = disputa concreta de dinero/cargo/factura.

Responde SOLO con la categoría en minúsculas, sin explicación.

Mensaje: "${message.slice(0, 300)}"`

      const result = await chatWithAI(
        [{ role: 'user', content: prompt }],
        'glm',
        'glm-4.5-flash',
        { maxTokens: 20, temperature: 0, tenantApiKey: apiKey }
      )
      const raw = (result.content || '').trim().toLowerCase()
      const valid: IntentEnum[] = ['compra','credito','cita','info','queja','reclamo','saludo']
      return valid.includes(raw as IntentEnum) ? (raw as IntentEnum) : keyword
    } catch {
      return keyword
    }
  }

  // ═════════════════════════════════════════════════════════════
  // MODULE 8: Sentiment Analyzer
  // ═════════════════════════════════════════════════════════════

  async analyzeSentiment(
    message: string,
    apiKey?: string
  ): Promise<SentimentEnum> {
    const keyword = classifySentimentByKeywords(message)

    // Only call LLM for borderline cases
    if (keyword === 'ENOJADO' || keyword === 'URGENTE') return keyword

    try {
      const prompt = `Clasifica el sentimiento del siguiente mensaje en UNA de estas categorías exactas:
POSITIVO, NEUTRAL, FRUSTRADO, ENOJADO, URGENTE

Responde SOLO con la categoría, sin explicación.

Mensaje: "${message.slice(0, 300)}"`

      const result = await chatWithAI(
        [{ role: 'user', content: prompt }],
        'glm',
        'glm-4.5-flash',
        { maxTokens: 20, temperature: 0, tenantApiKey: apiKey }
      )
      const raw = (result.content || '').trim().toUpperCase()
      const valid: SentimentEnum[] = ['POSITIVO','NEUTRAL','FRUSTRADO','ENOJADO','URGENTE']
      return valid.includes(raw as SentimentEnum) ? (raw as SentimentEnum) : keyword
    } catch {
      return keyword
    }
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 1: Analyze Lead (keyword-based scoring)
  // ═════════════════════════════════════════════════════════════

  analyzeLead(
    messages: { role: string; content: string }[],
    contactData?: {
      name?: string
      source?: string
      createdAt?: Date
      tags?: string[]
      leadScore?: number
    }
  ): LeadAnalysis {
    if (!messages || messages.length === 0) {
      return this.getDefaultAnalysis()
    }

    const userMessages = messages.filter((m) => m.role === 'user' || m.role === 'contact')
    if (userMessages.length === 0) {
      return this.getDefaultAnalysis()
    }

    const allText = userMessages.map((m) => m.content).join(' ')
    const normalizedText = normalize(allText)

    // Score breakdown
    const scores = {
      buyingSignals: 0,
      engagement: 0,
      qualification: 0,
      timing: 0,
      budget: 0,
    }

    const buyingSignalsDetected: string[] = []
    const objectionsDetected: string[] = []
    const tagsDetected: string[] = []

    // ── Analyze each category ──

    // Budget keywords
    for (const word of KEYWORD_CATEGORIES.budget.keywords) {
      if (normalizedText.includes(normalize(word))) {
        scores.budget += 3
        if (!tagsDetected.includes('tiene_interes_financiero')) {
          tagsDetected.push('tiene_interes_financiero')
        }
      }
    }
    scores.budget = Math.min(scores.budget, 25)

    // Urgency keywords
    for (const word of KEYWORD_CATEGORIES.urgency.keywords) {
      if (normalizedText.includes(normalize(word))) {
        scores.timing += 2.5
      }
    }
    scores.timing = Math.min(scores.timing, 25)

    // Model interest keywords
    for (const word of KEYWORD_CATEGORIES.modelInterest.keywords) {
      if (normalizedText.includes(normalize(word))) {
        scores.qualification += 1.5
        if (!tagsDetected.includes('interesa_modelo')) {
          tagsDetected.push('interesa_modelo')
        }
      }
    }
    scores.qualification = Math.min(scores.qualification, 20)

    // Buy signal keywords
    for (const word of KEYWORD_CATEGORIES.buySignals.keywords) {
      if (normalizedText.includes(normalize(word))) {
        scores.buyingSignals += 3
        buyingSignalsDetected.push(word)
      }
    }
    scores.buyingSignals = Math.min(scores.buyingSignals, 30)

    // Engagement keywords
    for (const word of KEYWORD_CATEGORIES.engagement.keywords) {
      if (normalizedText.includes(normalize(word))) {
        scores.engagement += 1
      }
    }
    scores.engagement = Math.min(scores.engagement, 10)

    // Trust keywords
    for (const word of KEYWORD_CATEGORIES.trust.keywords) {
      if (normalizedText.includes(normalize(word))) {
        scores.qualification += 2
        if (!tagsDetected.includes('referencia')) {
          tagsDetected.push('referencia')
        }
      }
    }

    // Objection detection
    for (const word of KEYWORD_CATEGORIES.objections.price) {
      if (normalizedText.includes(normalize(word))) {
        objectionsDetected.push(`precio: ${word}`)
      }
    }
    for (const word of KEYWORD_CATEGORIES.objections.time) {
      if (normalizedText.includes(normalize(word))) {
        objectionsDetected.push(`tiempo: ${word}`)
      }
    }
    for (const word of KEYWORD_CATEGORIES.objections.partner) {
      if (normalizedText.includes(normalize(word))) {
        objectionsDetected.push(`socio: ${word}`)
      }
    }

    if (objectionsDetected.length > 0 && !tagsDetected.includes('tiene_objeciones')) {
      tagsDetected.push('tiene_objeciones')
    }

    // ── Disinterest penalty ──
    // Explicit "no me interesa" / opt-out signals knock the lead down hard (spec: −30)
    // so a previously warm lead drops to cold and stops receiving aggressive follow-ups.
    let disinterestPenalty = 0
    const DISINTEREST_PATTERNS = /no me interesa|ya no me interesa|no estoy interesad|no gracias|ya no quiero|no quiero nada|dejame en paz|no me molestes|deja de escribir|quitame de|no insistas|ya consegui|ya compre en otro/
    if (DISINTEREST_PATTERNS.test(normalizedText)) {
      disinterestPenalty = 30
      if (!tagsDetected.includes('desinteresado')) tagsDetected.push('desinteresado')
    }

    // Detect specific product mentioned
    const productKeywords = KEYWORD_CATEGORIES.modelInterest.keywords.slice(0, 60)
    const mentionedProducts: string[] = []
    for (const v of productKeywords) {
      if (allText.toLowerCase().includes(v)) {
        mentionedProducts.push(v)
      }
    }
    if (mentionedProducts.length > 0) {
      tagsDetected.push(`producto: ${mentionedProducts[0]}`)
    }

    // Count conversation turns (engagement proxy)
    const conversationTurns = userMessages.length
    if (conversationTurns >= 3) {
      scores.engagement += 3
      tagsDetected.push('conversacion_activa')
    }
    if (conversationTurns >= 6) {
      scores.engagement += 4
      tagsDetected.push('alto_engagement')
    }

    // Calculate total score (disinterest penalty subtracted, clamped 0-100)
    const totalScore = Math.max(
      0,
      Math.min(
        Math.round(
          scores.buyingSignals +
          scores.engagement +
          scores.qualification +
          scores.timing +
          scores.budget
        ) - disinterestPenalty,
        100
      )
    )

    // Determine stage
    const stage = this.mapScoreToStage(totalScore, conversationTurns)

    // Determine temperature
    const temperature = this.mapScoreToTemperature(totalScore)

    // Detect intent from last message
    const lastUserMessage = userMessages[userMessages.length - 1]?.content || ''
    const intentResult = detectIntent(lastUserMessage)

    // Determine next action
    const nextAction = this.determineNextAction(totalScore, buyingSignalsDetected, objectionsDetected, intentResult)

    // Confidence based on data quality
    const confidence = this.calculateConfidence(conversationTurns, allText.length, tagsDetected.length)

    // Estimate deal value
    const estimatedValue = totalScore > 50 ? 450000 : totalScore > 25 ? 380000 : 320000

    return {
      score: totalScore,
      stage,
      temperature,
      intent: intentResult.intent,
      buyingSignals: buyingSignalsDetected,
      objections: objectionsDetected,
      tags: tagsDetected,
      estimatedValue,
      nextAction,
      confidence,
    }
  }

  private getDefaultAnalysis(): LeadAnalysis {
    return {
      score: 0,
      stage: 'new',
      temperature: 'cold',
      intent: 'greeting',
      buyingSignals: [],
      objections: [],
      tags: ['nuevo'],
      estimatedValue: 300000,
      nextAction: 'question',
      confidence: 0.3,
    }
  }

  private mapScoreToStage(score: number, turns: number): LeadAnalysis['stage'] {
    if (turns <= 1) return 'new'
    if (score >= 75) return 'negotiation'
    if (score >= 55) return 'proposal'
    if (score >= 30) return 'qualified'
    return 'engaged'
  }

  private mapScoreToTemperature(score: number): LeadAnalysis['temperature'] {
    // Spec: hot 70-100 | warm 30-69 | cold 0-29
    if (score >= 70) return 'hot'
    if (score >= 30) return 'warm'
    return 'cold'
  }

  private determineNextAction(
    score: number,
    buySignals: string[],
    objections: string[],
    intent: { intent: string; confidence: number }
  ): LeadAnalysis['nextAction'] {
    if (score > 70 && buySignals.length >= 2) return 'close'
    if (objections.length > 0) return 'handle_objection'
    if (intent.intent === 'buy_signal' && intent.confidence > 0.5) return 'close'
    if (score > 40) return 'educate'
    if (score < 20 && intent.intent === 'greeting') return 'question'
    return 'follow_up'
  }

  private calculateConfidence(turns: number, textLength: number, tagsCount: number): number {
    let confidence = 0.3
    confidence += Math.min(turns * 0.05, 0.3)
    confidence += Math.min(textLength / 1000, 0.2)
    confidence += Math.min(tagsCount * 0.05, 0.2)
    return Math.min(Math.round(confidence * 100) / 100, 1)
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 2: Detect Triggers
  // ═════════════════════════════════════════════════════════════

  detectTrigger(
    analysis: LeadAnalysis
  ): { isActive: boolean; triggerType: string; confidence: number; description: string } {
    // Buy signal trigger
    if (analysis.buyingSignals.length >= 2 && analysis.score >= 60) {
      return {
        isActive: true,
        triggerType: 'buy_signal_detected',
        confidence: 0.9,
        description: `Múltiples señales de compra detectadas: ${analysis.buyingSignals.slice(0, 3).join(', ')}`,
      }
    }

    // Price objection trigger
    if (analysis.objections.some((o) => o.startsWith('precio')) && analysis.score >= 30) {
      return {
        isActive: true,
        triggerType: 'price_objection',
        confidence: 0.85,
        description: 'Objeción de precio detectada. Activar manejo de objeciones.',
      }
    }

    // Urgency trigger
    if (analysis.tags.some((t) => t.includes('urgente') || t.includes('inmediato'))) {
      return {
        isActive: true,
        triggerType: 'urgency_signal',
        confidence: 0.8,
        description: 'Señal de urgencia detectada en la conversación.',
      }
    }

    // Appointment trigger
    if (analysis.intent === 'appointment_request') {
      return {
        isActive: true,
        triggerType: 'appointment_request',
        confidence: 0.85,
        description: 'El prospecto solicitó cita o información de la empresa.',
      }
    }

    // Engagement trigger (cold lead re-engaging)
    if (analysis.temperature === 'warm' && analysis.tags.includes('conversacion_activa')) {
      return {
        isActive: true,
        triggerType: 're_engagement',
        confidence: 0.7,
        description: 'Lead frío re-activando la conversación.',
      }
    }

    return {
      isActive: false,
      triggerType: 'none',
      confidence: 0,
      description: 'Sin triggers activos. Continuar flujo normal.',
    }
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 3: Make Decision
  // ═════════════════════════════════════════════════════════════

  makeDecision(
    analysis: LeadAnalysis,
    trigger: { isActive: boolean; triggerType: string; confidence: number }
  ): { action: string; strategy: string; priority: number } {
    if (!trigger.isActive) {
      // No trigger: default action based on score
      if (analysis.score < 20) {
        return {
          action: 'question',
          strategy: 'CALIFICACIÓN INICIAL: Identificar presupuesto, producto de interés, plazos.',
          priority: 1,
        }
      }
      if (analysis.score < 50) {
        return {
          action: 'educate',
          strategy: 'EDUCACIÓN: Presentar valor del producto y crear interés.',
          priority: 2,
        }
      }
      return {
        action: 'follow_up',
        strategy: 'MANTENIMIENTO: Mantener el interés y avanzar la conversación.',
        priority: 3,
      }
    }

    // Trigger-based decisions
    switch (trigger.triggerType) {
      case 'buy_signal_detected':
        return {
          action: 'close',
          strategy: 'CIERRE: El prospecto está listo. Proponer opciones concretas y pedir compromiso.',
          priority: 10,
        }

      case 'price_objection':
        return {
          action: 'handle_objection',
          strategy: 'OBJECIÓN DE PRECIO: Redirigir de "caro" a "inversión". Mostrar MSI, pago inicial bajo, valor de reventa.',
          priority: 8,
        }

      case 'appointment_request':
        return {
          action: 'close',
          strategy: 'AGENDAR CITA: Confirmar fecha, hora y qué producto ver. Enviar confirmación.',
          priority: 9,
        }

      case 'urgency_signal':
        return {
          action: 'close',
          strategy: 'URGENCIA: Acelerar el proceso. Ofrecer incentivo con fecha límite.',
          priority: 10,
        }

      case 're_engagement':
        return {
          action: 'follow_up',
          strategy: 'RE-ENGAGEMENT: Reconectar con el prospecto y retomar el flujo de calificación.',
          priority: 6,
        }

      default:
        return {
          action: 'educate',
          strategy: 'Continuar flujo de calificación y educación.',
          priority: 5,
        }
    }
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 4: Handle Objection (rule-based, no LLM needed)
  // ═════════════════════════════════════════════════════════════

  handleObjection(analysis: LeadAnalysis, objection: string): JHONResponse {
    const normalized = normalize(objection)

    // Price objection
    if (
      normalized.includes('caro') ||
      normalized.includes('no tengo dinero') ||
      normalized.includes('no me alcanza') ||
      normalized.includes('presupuesto') ||
      normalized.includes('costoso')
    ) {
      return {
        insight: 'Detecto que el precio es una preocupación. Esto es normal — la mayoría de nuestros clientes sienten lo mismo al inicio.',
        direction: 'Un producto no es un gasto, es una herramienta que genera valor. Hablemos de planes de pago: desde $3,000-5,000 MXN mensuales con pago inicial desde 10%. Además, el producto se deprecia menos que el dinero en el banco.',
        question: '¿Cuál es el monto mensual que te sentirías cómodo pagando? Así busco la mejor opción para ti.',
        rawResponse: 'Entiendo que el precio es una preocupación, es muy normal. Un producto no es un gasto, es una herramienta que genera valor. Hablemos de planes de pago: desde $3,000-5,000 MXN mensuales con pago inicial desde 10%. ¿Cuál es el monto mensual que te sentirías cómodo pagando?',
        tone: 'empathetic',
        isClosingAttempt: false,
        suggestedReplies: [
          'Hasta $5,000 al mes',
          'Hasta $8,000 al mes',
          'Hasta $12,000 al mes',
          'Quiero ver opciones',
        ],
      }
    }

    // Time objection
    if (
      normalized.includes('pensar') ||
      normalized.includes('despues') ||
      normalized.includes('mas tarde') ||
      normalized.includes('no ahora') ||
      normalized.includes('esperar')
    ) {
      return {
        insight: 'Entiendo que quieres tomarte tu tiempo. Es una decisión importante.',
        direction: 'Solo que cada mes que esperas, los precios pueden ajustarse entre $3,000-5,000 MXN. Además, las promociones de financiamiento cambian constantemente. Lo que hoy está a 48 MSI, mañana puede ser solo a 24.',
        question: '¿Qué te falta definir para tomar la decisión? Si te ayudo con esa información, ¿podríamos avanzar?',
        rawResponse: 'Entiendo que quieres tomarte tu tiempo, es una decisión importante. Solo que cada mes que esperas, los precios pueden ajustarse, y las promociones cambian constantemente. ¿Qué te falta definir para tomar la decisión?',
        tone: 'educational',
        isClosingAttempt: false,
        suggestedReplies: [
          'Necesito ver el producto primero',
          'Quiero comparar precios',
          '¿Puedes mandarme información?',
        ],
      }
    }

    // Partner objection
    if (
      normalized.includes('esposa') ||
      normalized.includes('esposo') ||
      normalized.includes('pareja') ||
      normalized.includes('familia') ||
      normalized.includes('preguntar') ||
      normalized.includes('hablar con')
    ) {
      return {
        insight: 'Es excelente que tomes en cuenta a tu familia en esta decisión. Un auto impacta a todos en casa.',
        direction: '¿Qué te parece si agendamos una reunión para que vengan juntos? Así pueden conocer el producto, hacer una demostración y tomar la decisión juntos. Tenemos horario de lunes a sábado.',
        question: '¿Sábado a las 10am o a las 12pm les quedaría mejor?',
        rawResponse: 'Es excelente que tomes en cuenta a tu familia en esta decisión. ¿Qué te parece si agendamos una reunión para que vengan juntos? Así pueden conocer el producto, hacer una demostración y tomar la decisión juntos. ¿Sábado a las 10am o a las 12pm les quedaría mejor?',
        tone: 'confident',
        isClosingAttempt: true,
        suggestedReplies: [
          'Sábado a las 10am ✓',
          'Sábado a las 12pm ✓',
          'Entre semana en la tarde',
          'Primero les consulto',
        ],
      }
    }

    // Generic objection fallback
    return {
      insight: 'Notas una preocupación. Quiero entenderla bien para darte la mejor solución.',
      direction: 'Cada situación es diferente y tenemos opciones flexibles. Cuéntame más sobre tu preocupación y busco la mejor alternativa para ti.',
      question: '¿Podrías contarme más sobre lo que te preocupa? Así puedo darte una solución específica.',
      rawResponse: 'Notas una preocupación y quiero entenderla bien para darte la mejor solución. Cada situación es diferente y tenemos opciones flexibles. ¿Podrías contarme más sobre lo que te preocupa?',
      tone: 'empathetic',
      isClosingAttempt: false,
      suggestedReplies: [
        'Es tema de precio',
        'Necesito más tiempo',
        'Tengo que consultarlo',
        'Prefiero que me manden info',
      ],
    }
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 5: Generate JHON Response (LLM-powered)
  // ═════════════════════════════════════════════════════════════

  /**
   * Builds a compact, internal "situational awareness" block from the engine's
   * own analysis + decision so the LLM responds WITH its analysis instead of
   * blind to it. Critical when a custom persona is used, because in that path
   * the built-in lead-analysis context (getSystemPrompt) is bypassed.
   */
  buildEngineAnalysisBlock(
    analysis: LeadAnalysis,
    decision: { action: string; strategy: string },
  ): string {
    const ACTION_GUIDE: Record<string, string> = {
      close:
        'CERRAR. El lead ya calificó. Presenta el plan concreto + precio, conéctalo con el valor recuperado y pide UN siguiente paso (RFC/datos para factura, link de pago o confirmar cita). NO hagas más preguntas de diagnóstico.',
      handle_objection:
        'MANEJAR OBJECIÓN. Resuelve la objeción reformulando de "costo" a "inversión/valor" y reintenta avanzar — no te quedes solo explicando.',
      educate:
        'APORTAR VALOR. Da UN dato concreto y útil sobre el producto y cierra con una micro-pregunta que avance la conversación. No repitas educación que ya diste.',
      follow_up:
        'AVANZAR. Mantén el momentum: propón el siguiente paso concreto (cita, demo o cierre suave). No reinicies la conversación.',
      question:
        'CALIFICAR. Haz UNA sola pregunta clave (presupuesto, urgencia o necesidad principal) para poder avanzar al lead.',
    }
    const nextAction = ACTION_GUIDE[decision.action] || decision.strategy

    const lines = [
      'ANÁLISIS INTERNO DEL SISTEMA (úsalo para decidir tu respuesta — NO lo menciones ni lo cites al cliente):',
      `- Intención detectada: ${analysis.intent || 'no determinada'}`,
      `- Score: ${analysis.score}/100 (${analysis.temperature})`,
      `- Señales de compra: ${analysis.buyingSignals.length ? analysis.buyingSignals.join(', ') : 'ninguna aún'}`,
      `- Objeción principal: ${analysis.objections.length ? analysis.objections[0] : 'ninguna'}`,
      `- PRÓXIMA ACCIÓN (lo que el sistema determinó que debes hacer AHORA): ${nextAction}`,
    ]

    // CLOSING MODE — injected even over a custom persona (e.g. JHON) so a hot,
    // qualified lead is actually pushed to close instead of looping in diagnosis.
    // This is the fix for "SELLER never closes": the routing brain may be
    // collapsed into the tenant's single persona, but the closing playbook is
    // forced here whenever the engine decides the lead is ready.
    if (decision.action === 'close' || (analysis.temperature === 'hot' && analysis.score >= 70)) {
      lines.push(
        '',
        '🔒 MODO CIERRE ACTIVADO — el lead ya calificó. NO hagas más preguntas de diagnóstico. Tu objetivo es CONCRETAR:',
        '1. Reafirma el precio/condición y conéctalo con el valor.',
        '2. Pide UN solo dato para avanzar: forma de pago o RFC para factura.',
        '3. Cuando el lead acepte pagar, emite [CRM:pago:monto|concepto] (monto sin comas, ej: 380000) — el sistema genera el link de pago REAL y lo agrega a tu mensaje. NUNCA inventes una URL.',
        '4. Si el lead da datos fiscales, emite [CRM:factura:rfc|razonSocial|usoCFDI].',
        '5. Al confirmar la compra: [CRM:close:ganado] + [CRM:stage:Cerrado].',
      )
    }
    return lines.join('\n')
  }

  async generateResponse(
    analysis: LeadAnalysis,
    decision: { action: string; strategy: string },
    context?: {
      personalityName?: string
      workspaceContext?: WorkspaceContext
      contactName?: string
      lastProduct?: string
      lastMessage?: string
      conversationHistory?: { role: string; content: string }[]
      temperature?: number
      dynamicContext?: string
      customSystemPrompt?: string
      aiProvider?: string
      tenantApiKey?: string
    }
  ): Promise<JHONResponse> {
    const personalityName = context?.personalityName || 'JHON'
    const dynamicTemperature = context?.temperature ?? 0.75
    const customSystemPrompt = context?.customSystemPrompt
    const aiProvider = context?.aiProvider || 'glm'

    // Build the system prompt with full context
    let systemPrompt: string
    if (customSystemPrompt && customSystemPrompt.trim()) {
      // Replace common business placeholders so the LLM never sees literal [DIRECCIÓN] etc.
      // Prefer data from active modules (agentName, address, hours) over legacy settings.
      const wc = context?.workspaceContext
      const tz = wc?.timezone || 'America/Mexico_City'
      const nowDTReplace = new Date()
      const currentDate = nowDTReplace.toLocaleDateString('es-MX', {
        timeZone: tz,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
      let resolved = customSystemPrompt
      resolved = resolved.replace(/\[EMPRESA\]/gi, wc?.businessName || 'nuestro negocio')
      resolved = resolved.replace(/\[NOMBRE_AGENCIA\]/gi, wc?.businessName || 'nuestro negocio')
      resolved = resolved.replace(/\[AGENCIA\]/gi, wc?.businessName || 'nuestro negocio')
      resolved = resolved.replace(/\[NOMBRE\]/gi, wc?.agentName || 'Jhon')
      resolved = resolved.replace(/\[DIRECCIÓN CONCRETA\]/gi, wc?.businessAddress || 'nuestra oficina')
      resolved = resolved.replace(/\[DIRECCIÓN\]/gi, wc?.businessAddress || 'nuestra oficina')
      resolved = resolved.replace(/\[TELÉFONO\]/gi, wc?.businessPhone || 'nuestro número de contacto')
      resolved = resolved.replace(/\[HORARIO\]/gi, wc?.businessHours || 'nuestro horario de atención')
      resolved = resolved.replace(/\[LINK_CITAS\]/gi, wc?.appointmentUrl || 'contáctanos para agendar')
      resolved = resolved.replace(/\[FECHA ACTUAL\]/gi, currentDate)
      // Custom persona path bypasses getSystemPrompt(), which is where the
      // built-in path injects lead analysis. Append the engine's analysis here
      // so the model responds WITH its analysis, not blind to it.
      systemPrompt = `${resolved}\n\n${this.buildEngineAnalysisBlock(analysis, decision)}`
    } else {
      systemPrompt = getSystemPrompt(
        personalityName,
        context?.workspaceContext,
        {
          score: analysis.score,
          stage: analysis.stage,
          temperature: analysis.temperature,
          intent: analysis.intent,
          buyingSignals: analysis.buyingSignals,
          objections: analysis.objections,
          contactName: context?.contactName,
          lastProduct: context?.lastProduct,
          lastMessage: context?.lastMessage,
        }
      )
    }

    // Inject current date/time in the BUSINESS timezone so the AI states
    // times in the customer's actual zone (e.g. Cancún UTC-5), not hardcoded CDMX.
    const apptTz = context?.workspaceContext?.timezone || 'America/Mexico_City'
    const nowDT = new Date()
    const dateTimeCtx = `\n\nFECHA Y HORA ACTUAL (zona del negocio, ${apptTz}): ${nowDT.toLocaleDateString('es-MX', { timeZone: apptTz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${nowDT.toLocaleTimeString('es-MX', { timeZone: apptTz, hour: '2-digit', minute: '2-digit', hour12: true })}. Usa SIEMPRE esta zona horaria al hablar de horas con el cliente.`
    systemPrompt += dateTimeCtx

    // Inject dynamic module context (agent_profile, location, appointments, catalog blocks)
    if (context?.workspaceContext?.moduleContext) {
      systemPrompt = `${context.workspaceContext.moduleContext}\n\n${systemPrompt}`
    }

    // Prepend dynamic context if available
    if (context?.dynamicContext) {
      systemPrompt = `${context.dynamicContext}\n\n${systemPrompt}`
    }

    // ⚠️ Disciplina de salida (al FINAL = lo último que lee el modelo). Crítico
    // con MiniMax: evita que filtre su razonamiento/estrategia. El IDIOMA sigue
    // al del cliente — por defecto español, PERO si el cliente escribió en inglés
    // se responde en inglés (fix 2026-07-21: este bloque forzaba "SIEMPRE
    // ESPAÑOL" y anulaba el soporte de inglés para turistas/extranjeros).
    const clientEN = clientWritesEnglish(context?.lastMessage || '')
    const idiomaRule = clientEN
      ? 'Responde en INGLÉS natural y fluido (el cliente te escribió en inglés). Precios en pesos MXN.'
      : 'SIEMPRE en ESPAÑOL de México (salvo que el cliente te escriba en otro idioma, entonces respóndele en el suyo).'
    systemPrompt += `\n\n# ⚠️ FORMATO DE SALIDA (OBLIGATORIO)
Devuelve ÚNICAMENTE el mensaje tal como lo leerá el cliente por WhatsApp. ${idiomaRule} Breve y natural (2-4 líneas).
PROHIBIDO: escribir tu razonamiento, plan o estrategia; usar etiquetas tipo "Stage:", "Strategy:", "Análisis:", "Plan:"; viñetas de planificación. Solo el mensaje para el cliente, nada más.`
    // Override de idioma DURO — última línea del prompt, en inglés, para que
    // MiniMax se ancle al inglés pese a la persona en español (fix 2026-07-21:
    // el bot seguía respondiendo en español a clientes que escriben en inglés).
    if (clientEN) {
      systemPrompt += `\n\n### CRITICAL LANGUAGE OVERRIDE (highest priority, overrides everything above)
The customer is writing in ENGLISH. You MUST write your ENTIRE reply in fluent, natural English. Do NOT use Spanish at all — not a single word or greeting. This rule overrides every Spanish instruction above. Keep prices in MXN.`
    }

    // Build conversation messages with full history for natural context
    const userMessage = context?.lastMessage || 'Hola, busco información sobre un producto.'
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Add recent conversation history for natural flow. Subido de 10 → 24:
    // con solo 10 el bot perdía el hilo en pláticas largas (se "reiniciaba").
    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-24)
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === 'contact' ? 'user' : 'assistant',
          content: msg.content,
        })
      }
    }

    // Add current message with minimal context (the system prompt handles strategy)
    messages.push({
      role: 'user',
      content: userMessage,
    })

    try {
      console.log(`[RevenueEngine] generateResponse → calling chatWithAI (${messages.length} messages, provider: ${aiProvider}, last: "${(context?.lastMessage || '').slice(0, 50)}")`)

      // For the customer-facing reply use a REASONING model (MiniMax-M3) when on
      // MiniMax: it keeps its chain-of-thought in a separate `reasoning_content`
      // channel, so `content` stays clean (no meta/English/calc leak). The cheap
      // non-reasoning model (Text-01) has no such channel and bleeds reasoning
      // into the reply. Give it room so reasoning doesn't eat the answer budget.
      const replyModel = aiProvider === 'minimax'
        ? (process.env.MINIMAX_REPLY_MODEL || 'MiniMax-M3')
        : undefined
      const result = await chatWithAI(messages, aiProvider, replyModel, {
        temperature: dynamicTemperature,
        // Reasoning model (M3): max_tokens INCLUDES reasoning_content. With the
        // heavy sales prompt the chain-of-thought can run 1-2k tokens; if it
        // eats the whole budget, `content` comes back EMPTY and we lose the
        // clean reply (forcing a fallback that leaks). 4000 guarantees room for
        // both the hidden reasoning AND the short WhatsApp message.
        maxTokens: 4000,
        tenantApiKey: context?.tenantApiKey,
      })

      console.log(`[RevenueEngine] generateResponse → got ${result.content.length} chars from ${result.model} (${result.latencyMs}ms)`)

      const parsed = this.parseJHONResponse(
        sanitizeLLMReply(result.content, { allowEnglish: clientWritesEnglish(context?.lastMessage || '') }),
        analysis
      )
      parsed._aiMetrics = {
        model: result.model,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
        // In-memory only; message-processor decides whether to persist (debug flag).
        systemPrompt,
        analysisBlock: this.buildEngineAnalysisBlock(analysis, decision),
      }
      return parsed
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[RevenueEngine] LLM generation failed:', errMsg)
      console.error('[RevenueEngine] Failed messages count:', messages.length, 'last msg:', (context?.lastMessage || '').slice(0, 80))

      // Fallback to rule-based response
      if (analysis.objections.length > 0) {
        return this.handleObjection(analysis, analysis.objections[0])
      }

      return {
        insight: `Lead ${analysis.temperature === 'hot' ? 'caliente' : 'en proceso de calificación'}.`,
        direction: analysis.score > 50
          ? 'Vamos a enfocarnos en encontrar la mejor opción para ti.'
          : 'Me gustaría conocerte mejor para darte la mejor recomendación.',
        question: analysis.score > 50
          ? '¿Qué día te viene mejor para visitar nuestra oficina?'
          : '¿Qué tipo de producto tienes en mente y cuál es tu presupuesto aproximado?',
        rawResponse: analysis.score > 50
          ? 'Vamos a enfocarnos en encontrar la mejor opción para ti. ¿Qué día te viene mejor para visitar nuestra oficina?'
          : 'Me gustaría conocerte mejor para darte la mejor recomendación. ¿Qué tipo de producto tienes en mente y cuál es tu presupuesto aproximado?',
        tone: analysis.score > 60 ? 'confident' : 'empathetic',
        isClosingAttempt: analysis.score > 70,
        suggestedReplies: ['Agendar cita', 'Quiero más información', 'Cuál es el precio'],
      }
    }
  }

  /**
   * Parse the LLM response into the JHONResponse structure.
   * Now supports NATURAL format (single WhatsApp message) with optional | replies.
   * Falls back to legacy [INSIGHT]/[DIRECCIÓN]/[PREGUNTA] tags if detected.
   */
  /**
   * Strip chain-of-thought / internal reasoning from the LLM output.
   * Some models (GLM Flash, thinking models) include their analysis steps
   * in the content field before the actual answer. This extracts only the
   * final message intended for the client.
   */
  private stripChainOfThought(raw: string): string {
    // Pattern 1: "**Output Generation:**" or "Output Generation:" — extract everything after
    const outputGenMatch = raw.match(/\*{0,2}Output\s+Generation\*{0,2}:?\*{0,2}\s*([\s\S]+)/i)
    if (outputGenMatch) {
      return outputGenMatch[1].trim()
    }

    // Pattern 2: </think> or </thinking> tags (explicit reasoning delimiter)
    const thinkTagMatch = raw.match(/<\/think(?:ing)?>\s*([\s\S]+)$/i)
    if (thinkTagMatch) {
      return thinkTagMatch[1].trim()
    }

    // Pattern 3: "Let's craft the message:" or "Let me craft" — take everything after
    const craftMatch = raw.match(/Let'?s?\s+craft\s+(?:the\s+)?message[:\s]*([\s\S]+)$/i)
    if (craftMatch) {
      // If followed by "Option 1:", extract just that option's text
      const opt1 = craftMatch[1].match(/Option\s*1[^:\n]*:\s*["«\u201c\u201d]?([^"«\u201c\u201d\n]{10,280})["»\u201c\u201d]?/i)
      if (opt1) return opt1[1].trim().replace(/^["'«»\u201c\u201d]+|["'«»\u201c\u201d]+$/g, '')
      return craftMatch[1].trim()
    }

    // Pattern 4: "Option 1:" present in verbose reasoning — extract first option
    const opt1 = raw.match(/Option\s*1[^:\n]*:\s*["«\u201c\u201d]?([^"«\u201c\u201d\n]{10,280})["»\u201c\u201d]?/i)
    if (opt1 && raw.length > 400) {
      return opt1[1].trim().replace(/^["'«»\u201c\u201d]+|["'«»\u201c\u201d]+$/g, '')
    }

    // Pattern 5: Detect chain-of-thought that fills the ENTIRE response (no final answer extracted).
    // If the response starts with analysis headers and is longer than 300 chars, it's likely
    // a pure reasoning dump with no usable reply — return empty so the caller uses a fallback.
    const cotPattern = /^[•\*\d\s]*(?:We\s+are\s+generating|Analyze\s+the\s+Input|Lead\s+Profile|Determine\s+the\s+Strategy|Draft\s+\d|Internal\s+Monologue|Persona\/Constraint|The\s+context\s+provided|Given\s+that\s+the\s+lead)/i
    if (cotPattern.test(raw) && raw.length > 300) {
      console.warn('[RevenueEngine] Chain-of-thought detected in full output — discarding reasoning dump')
      return ''
    }

    return raw
  }

  private parseJHONResponse(content: string, analysis: LeadAnalysis): JHONResponse {
    // Strip any chain-of-thought reasoning before parsing
    const strippedContent = this.stripChainOfThought(content.trim())

    // Clean the response
    // If chain-of-thought stripping left nothing usable, return empty rawResponse
    // so the caller falls back to a safe canned reply instead of sending garbage.
    if (!strippedContent) {
      // Neutro y útil tanto al inicio como a MEDIA conversación (este fallback
      // también dispara cuando el saneador descarta una fuga de prompt).
      const fallback = analysis.score > 50
        ? '¿Tienes alguna duda sobre lo que platicamos?'
        : 'Va, cuéntame un poco más para ayudarte mejor: ¿qué es lo que más te interesa resolver ahorita?'
      return {
        insight: fallback,
        direction: '',
        question: '',
        rawResponse: fallback,
        tone: 'empathetic',
        isClosingAttempt: false,
        suggestedReplies: ['Quiero más información', 'Agendar cita', 'Ver precios'],
      }
    }

    const cleaned = strippedContent.trim().replace(/^["']+|["']+$/g, '')

    let insight = ''
    let direction = ''
    let question = ''
    let suggestedReplies: string[] = []
    let tone: JHONResponse['tone'] = 'educational'

    // ── Check for legacy tagged format (backward compatibility) ──
    const hasTags = /\[(INSIGHT|DIRECC[OÓ]N|DIRECCION|PREGUNTA|REPLIES)\]/i.test(cleaned)

    if (hasTags) {
      const insightMatch = cleaned.match(/\[INSIGHT\]\s*([\s\S]*?)(?=\[DIRECC[OÓ]N\]|\[DIRECCION\]|$)/i)
      const directionMatch = cleaned.match(/\[DIRECC[OÓ]N\]|\[DIRECCION\]\s*([\s\S]*?)(?=\[PREGUNTA\]|$)/i)
      const questionMatch = cleaned.match(/\[PREGUNTA\]\s*([\s\S]*?)(?=\[REPLIES\]|$)/i)
      const repliesMatch = cleaned.match(/\[REPLIES\]\s*([\s\S]*?)$/i)

      if (insightMatch) insight = insightMatch[1].trim()
      if (directionMatch) direction = directionMatch[1].trim()
      if (questionMatch) question = questionMatch[1].trim()
      if (repliesMatch) {
        suggestedReplies = repliesMatch[1].split('|').map((r) => r.trim()).filter((r) => r.length > 0 && r.length < 80).slice(0, 4)
      }
    } else {
      // ── Natural format: single WhatsApp message ──
      // Extract quick replies from | separator at the end
      const pipeIndex = cleaned.lastIndexOf('|')
      let mainMessage = cleaned

      if (pipeIndex > 0) {
        const possibleReplies = cleaned.slice(pipeIndex + 1)
          .split('|')
          .map((r) => r.trim())
          .filter((r) => r.length > 2 && r.length < 80)
        if (possibleReplies.length >= 2) {
          suggestedReplies = possibleReplies.slice(0, 4)
          mainMessage = cleaned.slice(0, pipeIndex).trim()
        }
      }

      // Split into sentences for insight/direction/question
      const sentences = mainMessage
        .split(/[.!?]\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      if (sentences.length >= 2) {
        insight = sentences.slice(0, -1).join('. ').trim()
        question = sentences[sentences.length - 1]
        // Check if last sentence is a question
        if (!question.endsWith('?') && !/^¿/.test(question)) {
          insight = mainMessage
          question = ''
        }
      } else {
        insight = mainMessage
        question = ''
      }

      direction = '' // In natural mode, direction is embedded in the message
    }

    // Determine tone based on content
    const lowerContent = cleaned.toLowerCase()
    if (lowerContent.includes('agendar') || lowerContent.includes('cita') || lowerContent.includes('pasar')) {
      tone = 'confident'
    } else if (lowerContent.includes('entiendo') || lowerContent.includes('comprendo') || lowerContent.includes('no te preocupes')) {
      tone = 'empathetic'
    } else if (lowerContent.includes('solo quedan') || lowerContent.includes('última') || lowerContent.includes('se acaba')) {
      tone = 'urgent'
    } else if (analysis.score > 60) {
      tone = 'confident'
    }

    // Default suggested replies if none found
    if (suggestedReplies.length === 0) {
      if (analysis.score > 70) {
        suggestedReplies = ['Sí, agendemos', '¿Cuándo puedo pasar?', 'Me interesa']
      } else if (analysis.score > 40) {
        suggestedReplies = ['Quiero más información', '¿Puedo ver el producto?', 'Agendar cita']
      } else {
        suggestedReplies = ['Busco un plan básico', 'Busco la opción premium', '¿Cuál es el precio?']
      }
    }

    // Determine if this is a closing attempt
    const isClosingAttempt =
      analysis.score > 70 ||
      tone === 'confident' ||
      lowerContent.includes('agendar') ||
      lowerContent.includes('cita')

    // Add urgency boost if buy signals detected
    let urgencyBoost: string | undefined
    if (analysis.buyingSignals.length >= 2) {
      urgencyBoost = 'Lead con alta intención de compra. Priorizar cierre.'
    }

    return {
      insight: insight || cleaned,
      direction: direction || '',
      question: question || '',
      rawResponse: cleaned,
      tone,
      isClosingAttempt,
      suggestedReplies,
      urgencyBoost,
    }
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 6: Generate Follow-Up Tasks
  // ═════════════════════════════════════════════════════════════

  generateFollowUpTasks(analysis: LeadAnalysis): FollowUpTaskConfig[] {
    const tasks: FollowUpTaskConfig[] = []

    // First follow-up: immediate acknowledgment
    if (analysis.score < 30 && analysis.stage === 'new') {
      tasks.push({
        delayHours: 0,
        channel: 'whatsapp',
        template: 'Gracias por tu interés, {{name}}. Te comparto información sobre nuestros productos disponibles.',
        priority: 1,
      })
    }

    // Second follow-up: 2 hours later for new leads
    if (analysis.score >= 20 && analysis.score < 50) {
      tasks.push({
        delayHours: 2,
        channel: 'whatsapp',
        template: 'Hola {{name}}, ¿tuviste oportunidad de revisar la información? Tengo una excelente promoción que quiero contarte.',
        priority: 2,
      })
    }

    // Warm lead follow-up: next day
    if (analysis.score >= 30 && analysis.score < 70) {
      tasks.push({
        delayHours: 24,
        channel: 'whatsapp',
        template: 'Hola {{name}}, ¿qué te pareció la información? ¿Tienes alguna duda sobre el financiamiento?',
        priority: 3,
      })
    }

    // Hot lead follow-up: 4 hours
    if (analysis.score >= 70) {
      tasks.push({
        delayHours: 4,
        channel: 'whatsapp',
        template: 'Hola {{name}}, solo para confirmar: ¿vamos agendando tu visita a la oficina? Esta semana tenemos disponibilidad limitada.',
        priority: 1,
      })
      tasks.push({
        delayHours: 24,
        channel: 'whatsapp',
        template: 'Hola {{name}}, te escribo para recordarte que la promoción que platicamos termina pronto. ¿Queremos que te aparte la unidad?',
        priority: 2,
      })
    }

    // Re-engagement for cold leads: 48 hours
    if (analysis.temperature === 'cold' && analysis.tags.includes('conversacion_activa')) {
      tasks.push({
        delayHours: 48,
        channel: 'whatsapp',
        template: 'Hola {{name}}, sé que estás buscando opciones. Acabamos de llegar productos nuevos. ¿Te interesa que te cuente?',
        priority: 4,
      })
    }

    // Long follow-up for engaged leads
    if (analysis.stage === 'qualified' || analysis.stage === 'proposal') {
      tasks.push({
        delayHours: 72,
        channel: 'whatsapp',
        template: 'Hola {{name}}, ¿cómo estás? Solo quería seguir contigo. ¿Ya definiste algo o necesitas más información?',
        priority: 5,
      })
    }

    return tasks.slice(0, 5) // Max 5 follow-up tasks
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 7: Generate CRM Updates
  // ═════════════════════════════════════════════════════════════

  generateCrmUpdates(analysis: LeadAnalysis): CRMUpdate[] {
    const updates: CRMUpdate[] = []

    // Score update
    updates.push({
      type: 'score',
      value: analysis.score,
    })

    // Stage update
    updates.push({
      type: 'stage',
      value: analysis.stage,
    })

    // Tags update
    if (analysis.tags.length > 0) {
      updates.push({
        type: 'tags',
        value: analysis.tags,
      })
    }

    // Notes update with analysis summary
    const notes = [
      `Score: ${analysis.score}/100 (${analysis.temperature})`,
      `Intención: ${analysis.intent}`,
      `Etapa: ${analysis.stage}`,
    ]
    if (analysis.buyingSignals.length > 0) {
      notes.push(`Señales de compra: ${analysis.buyingSignals.slice(0, 3).join(', ')}`)
    }
    if (analysis.objections.length > 0) {
      notes.push(`Objeciones: ${analysis.objections.join(', ')}`)
    }

    updates.push({
      type: 'notes',
      value: notes.join(' | '),
    })

    // Persona update based on engagement pattern
    let persona = 'explorador'
    if (analysis.score >= 70) persona = 'comprador_listo'
    else if (analysis.score >= 50) persona = 'interesado_calificado'
    else if (analysis.score >= 30) persona = 'prospecto_cálido'
    else if (analysis.tags.includes('conversacion_activa')) persona = 'prospecto_activo'

    updates.push({
      type: 'persona',
      value: persona,
    })

    return updates
  }

  // ═════════════════════════════════════════════════════════════
  // STEP 8: Route to Agent
  // ═════════════════════════════════════════════════════════════

  routeToAgent(
    analysis: LeadAnalysis,
    conversationHistory: { role: string; content: string }[]
  ): AgentRoutingDecision {
    const routing = this.router.routeMessage(analysis, conversationHistory)
    return {
      agentType: routing.agentType,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
    }
  }

  // ═════════════════════════════════════════════════════════════
  // FULL PIPELINE: Process Conversation (Steps 1-8)
  // ═════════════════════════════════════════════════════════════

  async processConversation(params: {
    messages: { role: string; content: string }[]
    contactData?: {
      name?: string
      source?: string
      createdAt?: Date
      tags?: string[]
      leadScore?: number
    }
    workspaceContext?: WorkspaceContext
    personalityName?: string
    customSystemPrompt?: string
    aiProvider?: string
    temperature?: number
    dynamicContext?: string
    conversationHistory?: { role: string; content: string }[]
    conversationId?: string
    /** DIB: Lead profile context for personalization */
    leadProfileContext?: string
    /** Tenant AI API key — overrides the platform ZAI_API_KEY env var */
    tenantApiKey?: string
  }): Promise<RevenueEngineDecision> {
    const { messages, contactData, workspaceContext, personalityName, customSystemPrompt, aiProvider, temperature: aiTemperature, dynamicContext, conversationHistory, conversationId, leadProfileContext, tenantApiKey } = params

    // Step 1: Analyze lead
    const analysis = this.analyzeLead(messages, contactData)
    console.log(`[RevenueEngine] Lead analysis: score=${analysis.score}, stage=${analysis.stage}, temperature=${analysis.temperature}`)

    // Step 2: Detect triggers
    const trigger = this.detectTrigger(analysis)
    if (trigger.isActive) {
      console.log(`[RevenueEngine] Trigger active: ${trigger.triggerType} (${trigger.confidence})`)
    }

    // Step 3: Make decision
    const decision = this.makeDecision(analysis, trigger)
    console.log(`[RevenueEngine] Decision: ${decision.action} — ${decision.strategy.slice(0, 80)}`)

    // Step 4: Handle objection (if applicable)
    let response: JHONResponse
    const lastUserMessage = messages.filter((m) => m.role === 'user' || m.role === 'contact').pop()

    try {
      if (decision.action === 'handle_objection' && analysis.objections.length > 0) {
        response = this.handleObjection(analysis, analysis.objections[0])
      } else {
        // Step 5: Generate JHON response (LLM-powered)
        // Inject DIB profile context into dynamic context for personalization
        const enrichedDynamicContext = leadProfileContext
          ? `${leadProfileContext}\n\n${dynamicContext || ''}`
          : dynamicContext

        response = await this.generateResponse(analysis, decision, {
          personalityName: personalityName || 'JHON',
          workspaceContext,
          contactName: contactData?.name,
          lastMessage: lastUserMessage?.content,
          conversationHistory: conversationHistory || messages.slice(0, -1),
          temperature: aiTemperature,
          dynamicContext: enrichedDynamicContext,
          customSystemPrompt,
          aiProvider,
          tenantApiKey,
        })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[RevenueEngine] Response generation failed, using fallback:', errMsg)
      response = {
        insight: 'Lo siento, tuve un problema técnico. Pero estoy aquí para ayudarte.',
        direction: '',
        question: '¿En qué puedo ayudarte?',
        rawResponse: 'Lo siento, tuve un problema técnico. ¿En qué puedo ayudarte?',
        tone: 'empathetic',
        isClosingAttempt: false,
        suggestedReplies: ['Quiero info de autos', 'Agendar cita', '¿Cuál es el precio?'],
      }
    }

    // Step 6: Generate follow-up tasks
    const followUpTasks = this.generateFollowUpTasks(analysis)

    // Step 7: Generate CRM updates
    const crmUpdates = this.generateCrmUpdates(analysis)

    // Step 8: Route to agent
    const agentRouting = this.routeToAgent(analysis, messages)

    console.log(`[RevenueEngine] Agent routing: ${agentRouting.agentType} (confidence: ${agentRouting.confidence})`)

    return {
      action: decision.action as RevenueEngineDecision['action'],
      strategy: decision.strategy,
      response,
      followUpTasks,
      crmUpdates,
      agentRouting,
      aiMetrics: response._aiMetrics,
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const revenueEngine = new RevenueEngine()
