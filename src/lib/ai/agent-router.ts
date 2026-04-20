// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Agent Router with Intent Detection
// PicoClaw-style routing: analyzes lead data to pick the right agent
// ═══════════════════════════════════════════════════════════════

import type { AgentType, LeadAnalysis, IntentType } from '@/lib/types'

// ─── Intent Types ────────────────────────────────────────────

export type Intent =
  | 'greeting'
  | 'question_product'
  | 'question_price'
  | 'buy_signal'
  | 'objection_price'
  | 'objection_time'
  | 'objection_partner'
  | 'appointment_request'
  | 'followup'
  | 'complaint'
  | 'general'

// ─── Routing Decision ────────────────────────────────────────

export interface RoutingDecision {
  agentType: AgentType
  confidence: number
  reasoning: string
  intent: Intent
}

export interface IntentDetection {
  intent: Intent
  confidence: number
  keywords: string[]
}

// ─── Keyword Maps ────────────────────────────────────────────

const INTENT_KEYWORDS: Record<Intent, { patterns: RegExp[]; words: string[]; weight: number }> = {
  greeting: {
    patterns: [
      /\b(hola|buenos d[ií]as|buenas tardes|buenas noches|que tal|saludos|hey|hi|hello|buen d[ií]a)\b/i,
    ],
    words: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'saludos', 'hey'],
    weight: 1.0,
  },
  question_product: {
    patterns: [
      /\b(producto|servicio|plan|paquete|soluci[oó]n|opc[ióo]n|versi[oó]n|caracter[ií]stica|equipamiento|funcionalidad|modalidad)\b/i,
      /\b(b[aá]sico|est[aá]ndar|premium|vip|enterprise|pro|elite)\b/i,
      /\b(tiene|tiene disponibilidad|qu[ie]ro ver|me interesa|oficina|sucursal|empresa)\b/i,
    ],
    words: [
      'producto', 'servicio', 'plan', 'paquete', 'solucion', 'opcion',
      'version', 'caracteristicas', 'equipamiento', 'funcionalidad',
      'basico', 'estandar', 'premium', 'vip', 'enterprise', 'pro',
      'disponibilidad', 'oficina', 'sucursal', 'empresa',
    ],
    weight: 1.2,
  },
  question_price: {
    patterns: [
      /\b(precio|cuanto cuesta|cuanto vale|costo|tasa|mensualidad|cuota|cat|pago inicial|anticipo)\b/i,
      /\b(msi|meses sin intereses|financiamiento|cr[eé]dito|pr[eé]stamo)\b/i,
      /\b(oferta|promoci[oó]n|descuento|rebaja|especial|plan|paquete)\b/i,
    ],
    words: [
      'precio', 'cuanto cuesta', 'cuanto vale', 'costo', 'tasa', 'mensualidad', 'cuota',
      'cat', 'pago inicial', 'anticipo', 'msi', 'meses sin intereses', 'financiamiento',
      'credito', 'prestamo', 'oferta', 'promocion', 'descuento', 'rebaja',
      'especial', 'plan', 'paquete',
    ],
    weight: 1.3,
  },
  buy_signal: {
    patterns: [
      /\b(lo tomo|me lo llevo|vamos|quiero comprar|compro|lo compro|trato hecho|cerramos|hagamos trato)\b/i,
      /\b(cu[aá]ndo puedo|cu[aá]ndo puedo pasar|agendar|cita|visitar|ver el producto|demostraci[oó]n|demo)\b/i,
      /\b(d[oó]nde est[aá]n|ubicaci[oó]n|direcci[oó]n|domicilio|sucursal)\b/i,
      /\b(apartar|reservar|separar|dar inicial|pago inicial)\b/i,
      /\b(que necesito|documentos|requisitos|qué necesito para comprar)\b/i,
    ],
    words: [
      'lo tomo', 'me lo llevo', 'vamos', 'quiero comprar', 'compro', 'trato hecho',
      'cerramos', 'cuando puedo pasar', 'agendar', 'cita', 'visitar', 'ver el producto',
      'demostracion', 'demo', 'donde estan', 'ubicacion', 'direccion',
      'sucursal', 'apartar', 'reservar', 'separar', 'pago inicial', 'inicial',
      'que necesito', 'documentos', 'requisitos',
    ],
    weight: 1.5,
  },
  objection_price: {
    patterns: [
      /\b(esta muy caro|no tengo dinero|no me alcanza|muy costoso|fuera de presupuesto|muy caro|car[ií]simo)\b/i,
      /\b(barato|mas barato|otro lugar|competencia|mejor precio|igual|mas economico)\b/i,
    ],
    words: [
      'esta muy caro', 'no tengo dinero', 'no me alcanza', 'muy costoso',
      'fuera de presupuesto', 'muy caro', 'carisimo', 'barato', 'mas barato',
      'otro lugar', 'competencia', 'mejor precio', 'mas economico',
    ],
    weight: 1.3,
  },
  objection_time: {
    patterns: [
      /\b(lo voy a pensar|despu[eé]s|mas tarde|no es buen momento|no ahora|mas adelant[eae]|cuando tenga tiempo)\b/i,
      /\b(ocupado|ocupada|estoy ocupado|no tengo tiempo|ya ver[eé]|luego lo veo)\b/i,
    ],
    words: [
      'lo voy a pensar', 'despues', 'mas tarde', 'no es buen momento', 'no ahora',
      'mas adelante', 'cuando tenga tiempo', 'ocupado', 'no tengo tiempo',
      'ya vere', 'luego lo veo',
    ],
    weight: 1.2,
  },
  objection_partner: {
    patterns: [
      /\b(mi esposa|mi esposo|mi pareja|mi familia|tengo que preguntar|consultar|hablar con|deci[sd]en juntos)\b/i,
      /\b(la dueña|el dueño|tengo que hablar|no decido yo)\b/i,
    ],
    words: [
      'mi esposa', 'mi esposo', 'mi pareja', 'mi familia', 'tengo que preguntar',
      'consultar', 'hablar con', 'deciden juntos', 'la dueña', 'el dueño',
      'tengo que hablar', 'no decido yo',
    ],
    weight: 1.3,
  },
  appointment_request: {
    patterns: [
      /\b(cita|agendar|visitar|pasar|ir|llegar|demo|demostraci[oó]n|oficina)\b/i,
      /\b(que horario|horarios|atenci[oó]n|abierto|cu[aá]ndo|d[ií]a|s[aá]bado|domingo)\b/i,
    ],
    words: [
      'cita', 'agendar', 'visitar', 'pasar', 'ir', 'llegar', 'demo', 'demostracion',
      'oficina', 'que horario', 'horarios', 'atencion', 'abierto',
      'cuando', 'dia', 'sabado', 'domingo',
    ],
    weight: 1.4,
  },
  followup: {
    patterns: [
      /\b(estatus|estado|como va|avance|progreso|novedades|que paso|seguimiento)\b/i,
      /\b(volv[ií]|regres[eé]|contactar|comunicar|ya hablamos|hablamos hace)\b/i,
    ],
    words: [
      'estatus', 'estado', 'como va', 'avance', 'progreso', 'novedades',
      'que paso', 'seguimiento', 'volvi', 'regrese', 'contactar', 'comunicar',
      'ya hablamos', 'hablamos hace',
    ],
    weight: 1.0,
  },
  complaint: {
    patterns: [
      /\b(queja|inconforme|insatisfecho|mal servicio|no me gusta|problema|error|fallo|mala experiencia)\b/i,
      /\b(no respondieron|no contestaron|tard[oó] mucho|mentira|engaño|estaf[aai])\b/i,
    ],
    words: [
      'queja', 'inconforme', 'insatisfecho', 'mal servicio', 'no me gusta',
      'problema', 'error', 'fallo', 'mala experiencia', 'no respondieron',
      'no contestaron', 'tardo mucho', 'mentira', 'engano', 'estafa',
    ],
    weight: 1.1,
  },
  general: {
    patterns: [],
    words: [],
    weight: 0.5,
  },
}

// ─── Spanish NFD Normalization ───────────────────────────────

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// ─── Intent Detection ────────────────────────────────────────

/**
 * Detect the intent of a user message using keyword matching.
 * Returns the detected intent, confidence score, and matched keywords.
 */
export function detectIntent(message: string): IntentDetection {
  if (!message || message.trim().length === 0) {
    return { intent: 'general', confidence: 0, keywords: [] }
  }

  const normalized = normalizeText(message)
  const normalizedOriginal = message.toLowerCase()

  let bestIntent: Intent = 'general'
  let bestScore = 0
  let bestKeywords: string[] = []

  for (const [intentKey, config] of Object.entries(INTENT_KEYWORDS)) {
    if (intentKey === 'general') continue

    const intent = intentKey as Intent
    let score = 0
    const matchedKeywords: string[] = []

    // Check word matches
    for (const word of config.words) {
      const normalizedWord = normalizeText(word)
      if (normalized.includes(normalizedWord) || normalizedOriginal.includes(word)) {
        score += 1
        matchedKeywords.push(word)
      }
    }

    // Check pattern matches (bonus)
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        score += 0.5
      }
    }

    // Apply weight
    const weightedScore = score * config.weight

    if (weightedScore > bestScore) {
      bestScore = weightedScore
      bestIntent = intent
      bestKeywords = matchedKeywords
    }
  }

  // Calculate confidence (0-1 scale)
  const confidence = Math.min(bestScore / 3, 1)

  return {
    intent: bestIntent,
    confidence: Math.round(confidence * 100) / 100,
    keywords: bestKeywords,
  }
}

// ─── Map intents to LeadAnalysis intent type ─────────────────

function mapToLeadIntent(intent: Intent): string {
  const mapping: Record<Intent, string> = {
    greeting: 'exploration',
    question_product: 'product_interest',
    question_price: 'price_inquiry',
    buy_signal: 'purchase_ready',
    objection_price: 'price_objection',
    objection_time: 'timing_objection',
    objection_partner: 'authority_objection',
    appointment_request: 'appointment',
    followup: 're-engagement',
    complaint: 'issue',
    general: 'general',
  }
  return mapping[intent]
}

// ─── Agent Router ────────────────────────────────────────────

export class AgentRouter {
  /**
   * Route a message to the appropriate agent based on lead analysis
   * and conversation context.
   */
  routeMessage(
    analysis: LeadAnalysis,
    conversationHistory: { role: string; content: string }[]
  ): RoutingDecision {
    const lastMessage = conversationHistory.length > 0
      ? conversationHistory[conversationHistory.length - 1]
      : null

    if (!lastMessage) {
      return {
        agentType: 'qualifier',
        confidence: 0.7,
        reasoning: 'Sin historial de conversación, se asigna al calificador por defecto.',
        intent: 'greeting',
      }
    }

    const intentDetection = detectIntent(lastMessage.content)
    const { score, stage, temperature, buyingSignals, objections } = analysis

    // ── Rule 1: High score + buy signals → Sales Agent (closing mode)
    if (score > 70 && buyingSignals.length > 0) {
      return {
        agentType: 'sales',
        confidence: 0.9,
        reasoning: `Lead caliente (score: ${score}) con ${buyingSignals.length} señales de compra detectadas. Se activa modo cierre.`,
        intent: 'buy_signal',
      }
    }

    // ── Rule 2: Buy signal intent regardless of score
    if (intentDetection.intent === 'buy_signal' && intentDetection.confidence > 0.4) {
      return {
        agentType: 'sales',
        confidence: 0.85,
        reasoning: `Señal de compra detectada: "${intentDetection.keywords.join(', ')}". Enrutando a Sales Agent.`,
        intent: 'buy_signal',
      }
    }

    // ── Rule 3: Appointment request → Sales Agent
    if (intentDetection.intent === 'appointment_request' && intentDetection.confidence > 0.4) {
      return {
        agentType: 'sales',
        confidence: 0.85,
        reasoning: `Solicitud de cita/visita detectada. Enrutando a Sales Agent para agendar.`,
        intent: 'appointment_request',
      }
    }

    // ── Rule 4: Score 30-70 + objections → Sales Agent
    if (score >= 30 && score <= 70 && objections.length > 0) {
      return {
        agentType: 'sales',
        confidence: 0.8,
        reasoning: `Lead calificado (score: ${score}) con objeciones activas: "${objections.join(', ')}". Sales Agent debe manejar objeciones.`,
        intent: intentDetection.intent,
      }
    }

    // ── Rule 5: Objection detected (any score) → Sales Agent
    if (
      ['objection_price', 'objection_time', 'objection_partner'].includes(intentDetection.intent) &&
      intentDetection.confidence > 0.4
    ) {
      return {
        agentType: 'sales',
        confidence: 0.75,
        reasoning: `Objeción de ${intentDetection.intent.replace('objection_', '')} detectada con ${intentDetection.confidence * 100}% de confianza.`,
        intent: intentDetection.intent,
      }
    }

    // ── Rule 6: Follow-up intent → Follow-up Agent
    if (intentDetection.intent === 'followup' && intentDetection.confidence > 0.3) {
      return {
        agentType: 'followup',
        confidence: 0.8,
        reasoning: `Lead regresando o pidiendo seguimiento. Se asigna al agente de Follow-up.`,
        intent: 'followup',
      }
    }

    // ── Rule 7: Complaint → Sales Agent (human escalation path)
    if (intentDetection.intent === 'complaint' && intentDetection.confidence > 0.4) {
      return {
        agentType: 'sales',
        confidence: 0.7,
        reasoning: 'Queja detectada. Se requiere manejo empático y posible escalamiento a humano.',
        intent: 'complaint',
      }
    }

    // ── Rule 8: Stage = proposal or negotiation → Sales Agent
    if (stage === 'proposal' || stage === 'negotiation') {
      return {
        agentType: 'sales',
        confidence: 0.85,
        reasoning: `Lead en etapa de ${stage === 'proposal' ? 'propuesta' : 'negociación'}. Se requiere acción comercial.`,
        intent: intentDetection.intent,
      }
    }

    // ── Rule 9: Price/product questions + low score → Qualifier
    if (
      (intentDetection.intent === 'question_price' || intentDetection.intent === 'question_product') &&
      score < 30
    ) {
      return {
        agentType: 'qualifier',
        confidence: 0.85,
        reasoning: `Pregunta de ${intentDetection.intent === 'question_price' ? 'precio' : 'producto'} con lead no calificado (score: ${score}). Calificador debe profundizar.`,
        intent: intentDetection.intent,
      }
    }

    // ── Rule 10: Greeting or general + low score → Qualifier
    if ((intentDetection.intent === 'greeting' || intentDetection.intent === 'general') && score < 30) {
      return {
        agentType: 'qualifier',
        confidence: 0.8,
        reasoning: `Lead nuevo (${temperature === 'cold' ? 'frío' : temperature}) necesita calificación inicial.`,
        intent: intentDetection.intent,
      }
    }

    // ── Rule 11: Engaged but not qualified → Qualifier
    if (stage === 'engaged' && score < 50) {
      return {
        agentType: 'qualifier',
        confidence: 0.75,
        reasoning: `Lead comprometido pero no calificado (score: ${score}). Continuar calificación.`,
        intent: intentDetection.intent,
      }
    }

    // ── Default: Based on score
    if (score >= 50) {
      return {
        agentType: 'sales',
        confidence: 0.6,
        reasoning: `Score ${score} sugiere asignación a Sales Agent por defecto.`,
        intent: intentDetection.intent,
      }
    }

    return {
      agentType: 'qualifier',
      confidence: 0.6,
      reasoning: 'Asignación por defecto al calificador.',
      intent: intentDetection.intent,
    }
  }

  /**
   * Check if a lead is inactive and needs follow-up.
   * Considers the conversation history timestamps.
   */
  isLeadInactive(
    lastActivityDate: Date,
    hoursThreshold: number = 24
  ): boolean {
    const now = new Date()
    const diffMs = now.getTime() - lastActivityDate.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    return diffHours > hoursThreshold
  }

  /**
   * Determine the intent type for the types system.
   */
  getIntentType(message: string): IntentType {
    const detection = detectIntent(message)
    const mapping: Record<Intent, IntentType> = {
      greeting: 'greeting',
      question_product: 'product_inquiry',
      question_price: 'price_inquiry',
      buy_signal: 'buy_signal',
      objection_price: 'objection',
      objection_time: 'objection',
      objection_partner: 'objection',
      appointment_request: 'appointment',
      followup: 'followup',
      complaint: 'complaint',
      general: 'unknown',
    }
    return mapping[detection.intent]
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const agentRouter = new AgentRouter()
