// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Revenue Engine
// Full 9-step pipeline: Analyze → Trigger → Decide → Objection →
// Generate → Follow-up → CRM → Route → Deliver
// ═══════════════════════════════════════════════════════════════

import { debug } from '@/lib/logger'
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

// ─── Revenue Engine Class ────────────────────────────────────

export class RevenueEngine {
  private router = new AgentRouter()

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

    // Calculate total score
    const totalScore = Math.min(
      Math.round(
        scores.buyingSignals +
        scores.engagement +
        scores.qualification +
        scores.timing +
        scores.budget
      ),
      100
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
    if (score >= 70) return 'hot'
    if (score >= 35) return 'warm'
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
    }
  ): Promise<JHONResponse> {
    const personalityName = context?.personalityName || 'JHON'
    const dynamicTemperature = context?.temperature ?? 0.75
    const customSystemPrompt = context?.customSystemPrompt
    const aiProvider = context?.aiProvider || 'glm'

    // Build the system prompt with full context
    let systemPrompt: string
    // FIX: Always use JHON personality identity — custom prompt should be APPENDED, not replace identity
    const identityBlock = `IDENTIDAD FIJA: Te llamas JHON. Siempre te presentas como "Jhon" del equipo de ValiAutoFlow. NUNCA digas ser Carlos, Vali, ni ningún otro nombre. NUNCA cambies tu nombre.`
    if (customSystemPrompt && customSystemPrompt.trim()) {
      systemPrompt = `${identityBlock}\n\n${customSystemPrompt}`
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

    // Prepend dynamic context if available
    if (context?.dynamicContext) {
      systemPrompt = `${context.dynamicContext}\n\n${systemPrompt}`
    }

    // Build conversation messages with full history for natural context
    const userMessage = context?.lastMessage || 'Hola, busco información sobre un producto.'
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Add recent conversation history (last 30 messages) for natural flow
    // FIX: Increased from 10 to 30 to prevent context loss in long conversations
    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-30)
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === 'contact' ? 'user' : 'assistant',
          content: msg.content,
        })
      }
    }

    // FIX: Only add current message if it's NOT already the last message in history
    // This prevents sending the user's message twice to the LLM
    const lastHistoryMsg = context?.conversationHistory?.[context.conversationHistory.length - 1]
    const alreadyInHistory = lastHistoryMsg && lastHistoryMsg.role === 'contact' && lastHistoryMsg.content === userMessage
    if (!alreadyInHistory) {
      messages.push({
        role: 'user',
        content: userMessage,
      })
    }

    try {
      debug(`[RevenueEngine] generateResponse → calling chatWithAI (${messages.length} messages, provider: ${aiProvider}, last: "${(context?.lastMessage || '').slice(0, 50)}")`)

      const result = await chatWithAI(messages, aiProvider, undefined, {
        temperature: dynamicTemperature,
        maxTokens: 2048,
      })

      debug(`[RevenueEngine] generateResponse → got ${result.content.length} chars from ${result.model} (${result.latencyMs}ms)`)

      return this.parseJHONResponse(result.content, analysis)
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
  private parseJHONResponse(content: string, analysis: LeadAnalysis): JHONResponse {
    // Clean the response
    const cleaned = content.trim().replace(/^["']+|["']+$/g, '')

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
  }): Promise<RevenueEngineDecision> {
    const { messages, contactData, workspaceContext, personalityName, customSystemPrompt, aiProvider, temperature: aiTemperature, dynamicContext, conversationHistory, conversationId, leadProfileContext } = params

    // Step 1: Analyze lead
    const analysis = this.analyzeLead(messages, contactData)
    debug(`[RevenueEngine] Lead analysis: score=${analysis.score}, stage=${analysis.stage}, temperature=${analysis.temperature}`)

    // Step 2: Detect triggers
    const trigger = this.detectTrigger(analysis)
    if (trigger.isActive) {
      debug(`[RevenueEngine] Trigger active: ${trigger.triggerType} (${trigger.confidence})`)
    }

    // Step 3: Make decision
    const decision = this.makeDecision(analysis, trigger)
    debug(`[RevenueEngine] Decision: ${decision.action} — ${decision.strategy.slice(0, 80)}`)

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

    debug(`[RevenueEngine] Agent routing: ${agentRouting.agentType} (confidence: ${agentRouting.confidence})`)

    return {
      action: decision.action as RevenueEngineDecision['action'],
      strategy: decision.strategy,
      response,
      followUpTasks,
      crmUpdates,
      agentRouting,
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const revenueEngine = new RevenueEngine()
