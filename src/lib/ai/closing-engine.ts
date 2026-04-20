// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Closing Engine
// Assesses deal closability, suggests techniques, generates closing messages
// ═══════════════════════════════════════════════════════════════

import type { ClosingAssessment, DealClosability, ClosingTechnique, LeadAnalysis } from '@/lib/types'
import { chatWithAI } from './providers'
import type { LeadProfileData } from './lead-profiler'

// ─── Closing Techniques ──────────────────────────────────────

const CLOSING_TECHNIQUES: ClosingTechnique[] = [
  {
    id: 'alternative_close',
    name: 'Cierre Alternativo',
    description: 'Ofrece dos opciones, ambas llevan al cierre.',
    condition: 'Lead ha mostrado interés y pide información de modelo/precio',
    messageTemplate:
      'Perfecto, {{name}}. ¿Prefieres el {{model_a}} con pago inicial del 10% o el {{model_b}} con 24 MSI? Ambos están disponibles.',
  },
  {
    id: 'urgency_close',
    name: 'Cierre por Urgencia',
    description: 'Crea urgencia con deadline real.',
    condition: 'Lead tiene score > 60 y hay señales de compra',
    messageTemplate:
      '{{name}}, esta promoción termina el {{deadline}}. Solo nos quedan {{units}} productos. Si apartas hoy con ${{down_payment}}, te garantizo el precio y la promo.',
  },
  {
    id: 'assumptive_close',
    name: 'Cierre Asumtivo',
    description: 'Asumes que el prospecto ya decidió y preguntas por los detalles.',
    condition: 'Lead pregunta por documentos, requisitos o financiamiento',
    messageTemplate:
      'Excelente, {{name}}. Cuando vengas por tu {{model}}, ¿prefieres que lo tengamos listo para las 10am o las 12pm? Solo necesitas: INE y comprobante de domicilio.',
  },
  {
    id: 'summary_close',
    name: 'Cierre por Resumen',
    description: 'Resumes todos los beneficios acordados y cierras.',
    condition: 'Lead ha pasado por negociación y tiene objeciones resueltas',
    messageTemplate:
      '{{name}}, resumiendo: el {{model}} a {{color}}, con pago inicial de ${{down_payment}}, 48 MSI de ${{monthly}}. Incluye garantía por 1 año y 3 servicios de soporte. ¿Confirmamos?',
  },
  {
    id: 'testimonial_close',
    name: 'Cierre por Testimonial',
    description: 'Usa testimonios de clientes satisfechos.',
    condition: 'Lead muestra dudas o pide referencias',
    messageTemplate:
      '{{name}}, te entiendo perfectamente. A {{referral_name}} le pasó igual: dudaba hasta que vino a probarlo. Hoy está feliz con su {{model}}. ¿Agendamos tu demostración?',
  },
  {
    id: 'feel_felt_found_close',
    name: 'Cierre Feel-Felt-Found',
    description: 'Valida la objeción con experiencia de otros clientes.',
    condition: 'Lead tiene objeción activa de precio o tiempo',
    messageTemplate:
      '{{name}}, entiendo cómo te sientes. A muchos clientes también les pareció al inicio. Pero cuando vieron el costo total incluyendo garantía vs otras opciones, se dieron cuenta que era la mejor inversión. ¿Te muestro la comparativa?',
  },
  {
    id: 'soft_close',
    name: 'Cierre Suave (Trial Close)',
    description: 'Preguntas para medir temperatura sin comprometer.',
    condition: 'Lead está en exploración, score 30-50',
    messageTemplate:
      '{{name}}, si todo te parece bien y el plan de pago te sale cómodo, ¿serías este mes? Solo para ir preparando.',
  },
  {
    id: 'fear_of_missing_out',
    name: 'Cierre FOMO (Fear of Missing Out)',
    description: 'Apela a la pérdida de oportunidad.',
    condition: 'Lead ha mostrado interés fuerte pero no ha decidido',
    messageTemplate:
      '{{name}}, te comento que el mes que entrante suben los precios un 3-5%. Si compras ahora, te ahorras hasta $15,000 MXN. Además, el {{model}} se está agotando — lleva 3 semanas sin reabastecer.',
  },
]

// ─── Progress Check Keywords ─────────────────────────────────

const QUALIFICATION_KEYWORDS = [
  'presupuesto', 'cuanto', 'precio', 'pago inicial', 'cuota', 'mensualidad',
  'que buscas', 'que necesitas', 'para que', 'quien lo va a usar',
  'trabajo', 'ingresos', 'buro', 'credito',
]

const PRICE_DISCUSSED_KEYWORDS = [
  'precio', 'costo', 'cuota', 'mensualidad', 'pago inicial', 'msi',
  'meses sin intereses', 'total', 'a contado', 'financiado',
  'cat', 'tasa', 'comision',
]

const OBJECTION_HANDLED_KEYWORDS = [
  'perfecto', 'entendido', 'me convence', 'tiene razon', 'cierto',
  'genial', 'excelente', 'ok', 'bien', 'suena bien',
  'me gusta', 'va', 'adelante',
]

const URGENCY_KEYWORDS = [
  'oferta', 'promocion', 'semana', 'hoy', 'termina', 'ultima',
  'disponibilidad', 'agotando', 'descuento', 'apartar', 'reservar',
  'sube', 'sube el precio',
]

const FOLLOWUP_KEYWORDS = [
  'mañana', 'te llamo', 'te escribo', 'luego', 'seguimos en contacto',
  'te mando', 'te paso', 'envio', 'quedo',
]

// ─── Spanish NFD Normalization ───────────────────────────────

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

// ─── Closing Engine Class ────────────────────────────────────

export class ClosingEngine {
  /**
   * Assess how closable a deal is based on deal data and conversation.
   */
  assessDealClosability(
    dealData: {
      score?: number
      stage?: string
      value?: number
      createdAt?: Date
      lastActivityAt?: Date
      appointmentScheduled?: boolean
      demoCompleted?: boolean
      proposalSent?: boolean
    },
    messages: { role: string; content: string }[]
  ): ClosingAssessment {
    const score = dealData.score ?? 0
    const allText = messages
      .filter((m) => m.role === 'user' || m.role === 'contact')
      .map((m) => m.content)
      .join(' ')
    const normalizedText = normalize(allText)

    // Check each progress criterion
    const qualificationDone = QUALIFICATION_KEYWORDS.some((k) => normalizedText.includes(normalize(k)))
    const priceDiscussed = PRICE_DISCUSSED_KEYWORDS.some((k) => normalizedText.includes(normalize(k)))
    const objectionHandled = OBJECTION_HANDLED_KEYWORDS.some((k) => normalizedText.includes(normalize(k)))
    const urgencyCreated = URGENCY_KEYWORDS.some((k) => normalizedText.includes(normalize(k)))
    const followUpActive = FOLLOWUP_KEYWORDS.some((k) => normalizedText.includes(normalize(k)))

    // Calculate closability score (0-100)
    let closabilityScore = 0

    // Base score from deal score
    closabilityScore += Math.min(score * 0.4, 40)

    // Progress bonuses
    if (qualificationDone) closabilityScore += 10
    if (priceDiscussed) closabilityScore += 15
    if (objectionHandled) closabilityScore += 10
    if (urgencyCreated) closabilityScore += 10
    if (followUpActive) closabilityScore += 5

    // Deal data bonuses
    if (dealData.appointmentScheduled) closabilityScore += 8
    if (dealData.demoCompleted) closabilityScore += 15
    if (dealData.proposalSent) closabilityScore += 5

    closabilityScore = Math.min(Math.round(closabilityScore), 100)

    // Determine recommended technique
    const recommendedTechnique = this.suggestClosingTechnique({
      closabilityScore,
      recommendedTechnique: '',
      suggestedMessage: '',
      progress: {
        qualificationDone,
        priceDiscussed,
        objectionHandled,
        urgencyCreated,
        followUpActive,
      },
    } as ClosingAssessment)

    return {
      closabilityScore,
      recommendedTechnique,
      suggestedMessage: '',
      progress: {
        qualificationDone,
        priceDiscussed,
        objectionHandled,
        urgencyCreated,
        followUpActive,
      },
    }
  }

  /**
   * Suggest closing technique WITH lead profile context (DIB integration).
   * Uses archetype, communication style, price sensitivity, and objection
   * history to select the optimal technique.
   */
  suggestTechniqueWithProfile(
    assessment: ClosingAssessment,
    profile?: LeadProfileData
  ): string {
    // If no profile, fall back to standard method
    if (!profile) {
      return this.suggestClosingTechnique(assessment)
    }

    const { closabilityScore, progress } = assessment

    // ── Archetype-based technique selection ──
    switch (profile.archetype) {
      case 'practico':
        // Data-driven buyers: summary close with numbers
        if (progress.priceDiscussed && closabilityScore >= 50) return 'Cierre por Resumen'
        return 'Cierre Alternativo'

      case 'familiar':
        // Family-oriented: testimonial and feel-felt-found
        if (closabilityScore >= 60) return 'Cierre por Testimonial'
        return 'Cierre Feel-Felt-Found'

      case 'aspiracional':
        // Status seekers: exclusivity and FOMO
        if (closabilityScore >= 50) return 'Cierre FOMO (Fear of Missing Out)'
        return 'Cierre por Urgencia'

      case 'estrategico':
        // Analytical: summary close with ROI data
        if (closabilityScore >= 60) return 'Cierre por Resumen'
        return 'Cierre Alternativo'

      case 'consciente':
        // Conscious buyers: value-based
        if (closabilityScore >= 50) return 'Cierre por Resumen'
        return 'Cierre Suave (Trial Close)'
    }

    // ── Communication style-based adjustments ──
    if (profile.communicationStyle === 'cautious') {
      // Cautious buyers need softer approaches
      if (closabilityScore >= 50) return 'Cierre Feel-Felt-Found'
      return 'Cierre Suave (Trial Close)'
    }

    if (profile.communicationStyle === 'direct') {
      // Direct buyers can handle stronger closes
      if (closabilityScore >= 50) return 'Cierre Asumtivo'
      return 'Cierre Alternativo'
    }

    // ── Price sensitivity adjustments ──
    if (profile.priceSensitivity === 'high' && !progress.priceDiscussed) {
      // Price-sensitive leads need price discussion before closing
      return 'Cierre Suave (Trial Close)'
    }

    // ── Main objection-based adjustments ──
    if (profile.mainObjection === 'tiempo' && closabilityScore >= 50) {
      return 'Cierre por Urgencia'
    }
    if (profile.mainObjection === 'confianza' && closabilityScore >= 40) {
      return 'Cierre por Testimonial'
    }
    if (profile.mainObjection === 'precio' && closabilityScore >= 50) {
      return 'Cierre Feel-Felt-Found'
    }
    if (profile.mainObjection === 'autoridad' && closabilityScore >= 60) {
      return 'Cierre Asumtivo'
    }

    // ── Fallback: standard method ──
    return this.suggestClosingTechnique(assessment)
  }

  /**
   * Generate closing message WITH lead profile context (DIB integration).
   * Injects archetype-aware tone and personalization into the LLM prompt.
   */
  async generateClosingMessageWithProfile(
    assessment: ClosingAssessment,
    technique: string,
    context?: {
      contactName?: string
      productModel?: string
      productColor?: string
      initialPayment?: number
      monthlyPayment?: number
      deadline?: string
      remainingUnits?: number
      personalityName?: string
    },
    profile?: LeadProfileData
  ): Promise<string> {
    const techniqueConfig = CLOSING_TECHNIQUES.find(
      (t) => t.name === technique || t.id === technique
    )

    // Build profile-aware prompt additions
    let profileSection = ''
    if (profile) {
      const parts: string[] = []
      parts.push(`PERFIL DEL LEAD (DIB Intelligence):`)
      parts.push(`- Arquetipo: ${profile.archetype}`)
      parts.push(`- Estilo de comunicación: ${profile.communicationStyle}`)
      parts.push(`- Sensibilidad al precio: ${profile.priceSensitivity}`)
      if (profile.mainObjection) parts.push(`- Objección principal: ${profile.mainObjection}`)
      if (profile.buyingMotivation) parts.push(`- Motivación de compra: ${profile.buyingMotivation}`)
      if (profile.decisionMaker) parts.push(`- Decisor: ${profile.decisionMaker}`)

      // Archetype-specific instructions
      switch (profile.archetype) {
        case 'practico':
          parts.push('INSTRUCCIÓN: Usa datos concretos, números, comparativas. Evita emociones.')
          break
        case 'familiar':
          parts.push('INSTRUCCIÓN: Menciona beneficios familiares, seguridad. Tono cálido y cercano.')
          break
        case 'aspiracional':
          parts.push('INSTRUCCIÓN: Habla de exclusividad, experiencia, estatus. Lenguaje aspiracional.')
          break
        case 'estrategico':
          parts.push('INSTRUCCIÓN: Preséntale ROI, retorno, ventajas. Tono analítico con datos.')
          break
        case 'consciente':
          parts.push('INSTRUCCIÓN: Menciona sostenibilidad, eficiencia. Tono informado y accesible.')
          break
      }

      // Communication style instructions
      if (profile.communicationStyle === 'cautious') {
        parts.push('INSTRUCCIÓN DE TONO: Sé suave, no presiones. Dale espacio para pensar.')
      } else if (profile.communicationStyle === 'direct') {
        parts.push('INSTRUCCIÓN DE TONO: Sé directo y concreto. Ve al grano.')
      } else if (profile.communicationStyle === 'emotional') {
        parts.push('INSTRUCCIÓN DE TONO: Conecta emocionalmente. Usa entusiasmo moderado.')
      }

      profileSection = '\n\n' + parts.join('\n')
    }

    const contextInfo = context
      ? `Contexto del contacto:
- Nombre: ${context.contactName || 'Prospecto'}
- Producto: ${context.productModel || 'No especificado'}
${context.productColor ? `- Color: ${context.productColor}` : ''}
${context.initialPayment ? `- Pago inicial: $${context.initialPayment.toLocaleString('es-MX')} MXN` : ''}
${context.monthlyPayment ? `- Mensualidad: $${context.monthlyPayment.toLocaleString('es-MX')} MXN` : ''}
${context.deadline ? `- Deadline: ${context.deadline}` : ''}
${context.remainingUnits ? `- Disponibilidad restante: ${context.remainingUnits}` : ''}`
      : 'Sin contexto adicional.'

    const systemPrompt = `Eres un experto cerrador de ventas en México.
Tu objetivo es generar UN ÚNICO mensaje de cierre usando la técnica "${technique}".

${techniqueConfig ? `Descripción de la técnica: ${techniqueConfig.description}` : ''}
${techniqueConfig ? `Plantilla base: ${techniqueConfig.messageTemplate}` : ''}

Evaluación del deal:
- Score de cierre: ${assessment.closabilityScore}/100
- Calificación completada: ${assessment.progress.qualificationDone ? 'Sí' : 'No'}
- Precio discutido: ${assessment.progress.priceDiscussed ? 'Sí' : 'No'}
- Objeciones manejadas: ${assessment.progress.objectionHandled ? 'Sí' : 'No'}
- Urgencia creada: ${assessment.progress.urgencyCreated ? 'Sí' : 'No'}

${contextInfo}
${profileSection}

REGLAS:
1. Habla en español mexicano natural
2. Sé directo pero empático
3. Siempre incluye un call-to-action concreto
4. No uses más de 3 oraciones
5. Adapta la plantilla al contexto proporcionado
6. NO uses etiquetas como [INSIGHT] o [DIRECCIÓN] — solo el mensaje directo`

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `Genera el mensaje de cierre usando la técnica "${technique}" con score ${assessment.closabilityScore}.`,
      },
    ]

    try {
      const result = await chatWithAI(messages, 'groq', undefined, {
        temperature: 0.7,
        maxTokens: 512,
      })

      return result.content.trim()
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[ClosingEngine] LLM generation failed:', errMsg)

      // Fallback: use template
      if (techniqueConfig) {
        return techniqueConfig.messageTemplate
          .replace(/\{\{name\}\}/g, context?.contactName || 'amigo')
          .replace(/\{\{model\}\}/g, context?.productModel || 'producto')
          .replace(/\{\{color\}\}/g, context?.productColor || 'color')
          .replace(/\{\{down_payment\}\}/g, (context?.initialPayment || 50000).toString())
          .replace(/\{\{monthly\}\}/g, (context?.monthlyPayment || 6000).toString())
          .replace(/\{\{deadline\}\}/g, context?.deadline || 'este viernes')
          .replace(/\{\{units\}\}/g, (context?.remainingUnits || 3).toString())
      }

      return '¿Te gustaría agendar una cita para conocer el producto? Podemos encontrar la mejor opción de financiamiento para ti.'
    }
  }

  /**
   * Suggest the best closing technique based on assessment.
   */
  suggestClosingTechnique(assessment: ClosingAssessment): string {
    const { closabilityScore, progress } = assessment

    // High closability: use strong closing techniques
    if (closabilityScore >= 75) {
      if (progress.objectionHandled && progress.priceDiscussed) {
        return 'Cierre por Resumen' // summary_close
      }
      if (progress.priceDiscussed) {
        return 'Cierre Asumtivo' // assumptive_close
      }
      return 'Cierre Alternativo' // alternative_close
    }

    // Medium closability
    if (closabilityScore >= 50) {
      if (!progress.priceDiscussed) {
        return 'Cierre Suave (Trial Close)' // soft_close
      }
      if (!progress.objectionHandled) {
        return 'Cierre Feel-Felt-Found' // feel_felt_found_close
      }
      return 'Cierre por Urgencia' // urgency_close
    }

    // Low closability
    if (closabilityScore >= 30) {
      if (!progress.qualificationDone) {
        return 'Cierre Suave (Trial Close)' // soft_close - to gauge interest
      }
      return 'Cierre por Testimonial' // testimonial_close
    }

    // Very low closability: don't close yet
    return 'Cierre Suave (Trial Close)'
  }

  /**
   * Get the full DealClosability analysis with strengths, risks, and detailed progress.
   */
  getDealClosability(
    dealData: {
      score?: number
      stage?: string
      value?: number
      createdAt?: Date
      lastActivityAt?: Date
      appointmentScheduled?: boolean
      demoCompleted?: boolean
      proposalSent?: boolean
    },
    messages: { role: string; content: string }[]
  ): DealClosability {
    const assessment = this.assessDealClosability(dealData, messages)
    const strengths: string[] = []
    const risks: string[] = []
    const stagesCompleted: string[] = []
    const stagesRemaining: string[] = []

    // Build strengths
    if (assessment.progress.qualificationDone) {
      strengths.push('Calificación completada — se conoce presupuesto y necesidades')
      stagesCompleted.push('Calificación')
    }
    if (assessment.progress.priceDiscussed) {
      strengths.push('Precio y financiamiento discutidos')
      stagesCompleted.push('Precio/Financiamiento')
    }
    if (assessment.progress.objectionHandled) {
      strengths.push('Objeciones manejadas con éxito')
      stagesCompleted.push('Manejo de objeciones')
    }
    if (assessment.progress.urgencyCreated) {
      strengths.push('Urgencia creada en la conversación')
      stagesCompleted.push('Urgencia')
    }
    if (dealData.appointmentScheduled) {
      strengths.push('Cita agendada en la empresa')
      stagesCompleted.push('Cita agendada')
    }
    if (dealData.demoCompleted) {
      strengths.push('Demostración completada — alto indicador de cierre')
      stagesCompleted.push('Demostración')
    }
    if (dealData.proposalSent) {
      strengths.push('Propuesta formal enviada')
      stagesCompleted.push('Propuesta enviada')
    }

    // Build risks
    if (!assessment.progress.qualificationDone) {
      risks.push('No se ha completado la calificación — no se conoce presupuesto')
      stagesRemaining.push('Calificación')
    }
    if (!assessment.progress.priceDiscussed) {
      risks.push('No se ha discutido precio — el prospecto no conoce opciones')
      stagesRemaining.push('Precio/Financiamiento')
    }
    if (!assessment.progress.objectionHandled && dealData.score && dealData.score > 30) {
      risks.push('Objeciones pendientes de resolver')
      stagesRemaining.push('Manejo de objeciones')
    }
    if (!assessment.progress.urgencyCreated && dealData.score && dealData.score > 50) {
      risks.push('No se ha creado urgencia — el prospecto puede postergar')
      stagesRemaining.push('Crear urgencia')
    }
    if (!dealData.appointmentScheduled && dealData.score && dealData.score > 60) {
      risks.push('Sin cita agendada — no hay compromiso presencial')
      stagesRemaining.push('Agendar cita')
    }
    if (!dealData.demoCompleted && dealData.score && dealData.score > 50) {
      stagesRemaining.push('Demostración')
    }

    // Calculate progress percentage
    const totalStages = 7 // qualification, price, objection, urgency, appointment, demo, proposal
    const progressPercentage = Math.round((stagesCompleted.length / totalStages) * 100)

    // Get the appropriate technique for a message
    const techniqueId = this.getTechniqueIdByName(assessment.recommendedTechnique)
    const technique = CLOSING_TECHNIQUES.find((t) => t.id === techniqueId)

    return {
      score: assessment.closabilityScore,
      confidence: assessment.closabilityScore >= 70 ? 0.85 : assessment.closabilityScore >= 40 ? 0.6 : 0.35,
      strengths,
      risks,
      recommendedTechnique: assessment.recommendedTechnique,
      recommendedMessage: technique?.messageTemplate || '',
      progressPercentage,
      stagesCompleted,
      stagesRemaining,
    }
  }

  /**
   * Generate a personalized closing message using LLM.
   */
  async generateClosingMessage(
    assessment: ClosingAssessment,
    technique: string,
    context?: {
      contactName?: string
      productModel?: string
      productColor?: string
      initialPayment?: number
      monthlyPayment?: number
      deadline?: string
      remainingUnits?: number
      personalityName?: string
    }
  ): Promise<string> {
    const techniqueConfig = CLOSING_TECHNIQUES.find(
      (t) => t.name === technique || t.id === technique
    )

    const contextInfo = context
      ? `Contexto del contacto:
- Nombre: ${context.contactName || 'Prospecto'}
- Producto: ${context.productModel || 'No especificado'}
${context.productColor ? `- Color: ${context.productColor}` : ''}
${context.initialPayment ? `- Pago inicial: $${context.initialPayment.toLocaleString('es-MX')} MXN` : ''}
${context.monthlyPayment ? `- Mensualidad: $${context.monthlyPayment.toLocaleString('es-MX')} MXN` : ''}
${context.deadline ? `- Deadline: ${context.deadline}` : ''}
${context.remainingUnits ? `- Disponibilidad restante: ${context.remainingUnits}` : ''}`
      : 'Sin contexto adicional.'

    const systemPrompt = `Eres un experto cerrador de ventas en México.
Tu objetivo es generar UN ÚNICO mensaje de cierre usando la técnica "${technique}".

${techniqueConfig ? `Descripción de la técnica: ${techniqueConfig.description}` : ''}
${techniqueConfig ? `Plantilla base: ${techniqueConfig.messageTemplate}` : ''}

Evaluación del deal:
- Score de cierre: ${assessment.closabilityScore}/100
- Calificación completada: ${assessment.progress.qualificationDone ? 'Sí' : 'No'}
- Precio discutido: ${assessment.progress.priceDiscussed ? 'Sí' : 'No'}
- Objeciones manejadas: ${assessment.progress.objectionHandled ? 'Sí' : 'No'}
- Urgencia creada: ${assessment.progress.urgencyCreated ? 'Sí' : 'No'}

${contextInfo}

REGLAS:
1. Habla en español mexicano natural
2. Sé directo pero empático
3. Siempre incluye un call-to-action concreto
4. No uses más de 3 oraciones
5. Adapta la plantilla al contexto proporcionado
6. NO uses etiquetas como [INSIGHT] o [DIRECCIÓN] — solo el mensaje directo`

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `Genera el mensaje de cierre usando la técnica "${technique}" con score ${assessment.closabilityScore}.`,
      },
    ]

    try {
      const result = await chatWithAI(messages, 'groq', undefined, {
        temperature: 0.7,
        maxTokens: 512,
      })

      return result.content.trim()
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error('[ClosingEngine] LLM generation failed:', errMsg)

      // Fallback: use template
      if (techniqueConfig) {
        return techniqueConfig.messageTemplate
          .replace(/\{\{name\}\}/g, context?.contactName || 'amigo')
          .replace(/\{\{model\}\}/g, context?.productModel || 'producto')
          .replace(/\{\{color\}\}/g, context?.productColor || 'color')
          .replace(/\{\{down_payment\}\}/g, (context?.initialPayment || 50000).toString())
          .replace(/\{\{monthly\}\}/g, (context?.monthlyPayment || 6000).toString())
          .replace(/\{\{deadline\}\}/g, context?.deadline || 'este viernes')
          .replace(/\{\{units\}\}/g, (context?.remainingUnits || 3).toString())
      }

      return '¿Te gustaría agendar una cita para conocer el producto? Podemos encontrar la mejor opción de financiamiento para ti.'
    }
  }

  /**
   * Track closing progress over time.
   */
  trackClosingProgress(
    dealData: {
      score: number
      stage: string
      messages: { role: string; content: string; timestamp?: Date }[]
      milestones?: {
        qualificationDone?: boolean
        priceDiscussed?: boolean
        objectionHandled?: boolean
        urgencyCreated?: boolean
        appointmentScheduled?: boolean
        demoCompleted?: boolean
        proposalSent?: boolean
      }
    }
  ): {
    currentScore: number
    previousScore?: number
    scoreTrend: 'improving' | 'stable' | 'declining'
    estimatedCloseDate: string
    riskFactors: string[]
    nextMilestone: string
    velocity: number // points per day
  } {
    const { messages, milestones } = dealData
    const assessment = this.assessDealClosability(dealData, messages)

    // Calculate velocity (progress over time)
    const now = new Date()
    const firstMessage = messages[0]?.timestamp
    const daysActive = firstMessage
      ? Math.max((now.getTime() - new Date(firstMessage).getTime()) / (1000 * 60 * 60 * 24), 1)
      : 1
    const velocity = Math.round((assessment.closabilityScore / daysActive) * 10) / 10

    // Estimate close date
    const remainingScore = 100 - assessment.closabilityScore
    const daysToClose = velocity > 0 ? Math.ceil(remainingScore / velocity) : 999
    const estimatedCloseDate = new Date(now.getTime() + daysToClose * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    // Risk factors
    const riskFactors: string[] = []
    if (velocity < 2) riskFactors.push('Velocidad de progreso baja')
    if (!assessment.progress.priceDiscussed) riskFactors.push('No se ha hablado de precio')
    if (!assessment.progress.qualificationDone) riskFactors.push('Calificación incompleta')
    if (daysActive > 14 && assessment.closabilityScore < 50) riskFactors.push('Lead estancado (>14 días)')
    if (!milestones?.appointmentScheduled && assessment.closabilityScore > 50) {
      riskFactors.push('Sin cita agendada a pesar de alto score')
    }

    // Next milestone
    let nextMilestone = 'Completar calificación'
    if (assessment.progress.qualificationDone) nextMilestone = 'Discutir precio/financiamiento'
    if (assessment.progress.priceDiscussed) nextMilestone = 'Manejar objeciones'
    if (assessment.progress.objectionHandled) nextMilestone = 'Crear urgencia'
    if (assessment.progress.urgencyCreated) nextMilestone = 'Agendar cita en la empresa'
    if (milestones?.appointmentScheduled) nextMilestone = 'Demostración'
    if (milestones?.demoCompleted) nextMilestone = 'Enviar propuesta y cerrar'

    return {
      currentScore: assessment.closabilityScore,
      scoreTrend: velocity >= 3 ? 'improving' : velocity >= 1 ? 'stable' : 'declining',
      estimatedCloseDate: daysToClose > 90 ? 'Sin estimación (lead estancado)' : estimatedCloseDate,
      riskFactors,
      nextMilestone,
      velocity,
    }
  }

  /**
   * Get technique ID from technique name.
   */
  private getTechniqueIdByName(name: string): string {
    const mapping: Record<string, string> = {
      'Cierre Alternativo': 'alternative_close',
      'Cierre por Urgencia': 'urgency_close',
      'Cierre Asumtivo': 'assumptive_close',
      'Cierre por Resumen': 'summary_close',
      'Cierre por Testimonial': 'testimonial_close',
      'Cierre Feel-Felt-Found': 'feel_felt_found_close',
      'Cierre Suave (Trial Close)': 'soft_close',
      'Cierre FOMO (Fear of Missing Out)': 'fear_of_missing_out',
    }
    return mapping[name] || 'soft_close'
  }

  /**
   * Get all available closing techniques.
   */
  getTechniques(): ClosingTechnique[] {
    return [...CLOSING_TECHNIQUES]
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const closingEngine = new ClosingEngine()
