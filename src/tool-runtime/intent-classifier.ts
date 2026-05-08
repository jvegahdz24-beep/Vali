// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 3: TOOL OS Runtime
// Intent Classifier — Maps user/AI input to tool contracts
//
// Architecture:
//   1. Classify raw input → structured intent
//   2. Match intent → best tool contract (category + keyword scoring)
//   3. Assess risk based on intent type + tool risk level
//   4. Persist IntentRecord for audit trail
//   5. Return classification with confidence score
//
// Classification uses pattern matching (no external AI dependency).
// The system is designed to be enhanced with LLM-based classification
// in a future iteration without changing the interface.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import type { IntentClassification, RiskLevel } from './types'
import { TOOL_RUNTIME_EVENTS } from './types'

const TAG = 'INTENT_CLASSIFIER'

// ─── Intent Patterns ────────────────────────────────────────
// Pattern-based intent recognition. Each pattern maps to an
// intent type and has associated keywords and entity extractors.

interface IntentPattern {
  type: string
  label: string
  keywords: string[]
  patterns: RegExp[]
  category: string        // Preferred tool category
  urgency: 'low' | 'medium' | 'high' | 'critical'
  estimatedRisk: RiskLevel
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'send_message',
    label: 'Send Message',
    keywords: ['enviar', 'mandar', 'mensaje', 'message', 'send', 'whatsapp', 'escribir', 'write', 'text'],
    patterns: [/env[ií]a(r|do)?\s+(un\s+)?mensaje/i, /send\s+(a\s+)?message/i, /manda(r)?\s+(un\s+)?(whatsapp|texto)/i],
    category: 'communication',
    urgency: 'medium',
    estimatedRisk: 'MODERATE',
  },
  {
    type: 'query_data',
    label: 'Query Data',
    keywords: ['buscar', 'consulta', 'query', 'find', 'show', 'ver', 'lista', 'list', 'datos', 'data', 'info', 'información'],
    patterns: [/busca(r|ndo)?\s+(contactos?|leads?|clientes?)/i, /show\s+me\s+(contacts?|leads?|deals?)/i, /cu[aá]ntos?\s+(contactos?|leads?|clientes?)/i],
    category: 'analytics',
    urgency: 'low',
    estimatedRisk: 'SAFE',
  },
  {
    type: 'modify_record',
    label: 'Modify Record',
    keywords: ['actualizar', 'modificar', 'editar', 'update', 'edit', 'change', 'cambiar', 'agregar', 'añadir', 'crear', 'delete', 'eliminar', 'borrar'],
    patterns: [/actualiza(r)?\s+(el\s+)?(contacto|lead|cliente)/i, /(update|edit|change)\s+(the\s+)?(contact|lead|deal)/i, /elimina(r)?\s+(el\s+)?(contacto|lead)/i],
    category: 'crm',
    urgency: 'medium',
    estimatedRisk: 'MODERATE',
  },
  {
    type: 'analyze',
    label: 'Analyze',
    keywords: ['analizar', 'análisis', 'analyze', 'report', 'reporte', 'métricas', 'metrics', 'estadísticas', 'stats', 'kpi', 'dashboard'],
    patterns: [/analiza(r)?\s+(la\s+)?(información|datos|performance)/i, /generate\s+(a\s+)?(report|analysis)/i, /mostrar\s+(el\s+)?(dashboard|reporte)/i],
    category: 'analytics',
    urgency: 'low',
    estimatedRisk: 'SAFE',
  },
  {
    type: 'schedule',
    label: 'Schedule',
    keywords: ['agendar', 'programar', 'schedule', 'calendar', 'cita', 'appointment', 'recordatorio', 'reminder', 'seguimiento', 'follow-up', 'followup'],
    patterns: [/agenda(r)?\s+(una\s+)?(cita|reunión|llamada)/i, /schedule\s+(a|an|the)\s+(call|meeting|appointment)/i, /programa(r)?\s+(un\s+)?(seguimiento|recordatorio)/i],
    category: 'calendar',
    urgency: 'medium',
    estimatedRisk: 'MODERATE',
  },
  {
    type: 'automate',
    label: 'Automate',
    keywords: ['automatizar', 'automación', 'automation', 'flujo', 'workflow', 'trigger', 'disparador', 'regla', 'rule', 'bot'],
    patterns: [/crea(r)?\s+(una\s+)?(automatización|regla|flujo)/i, /set\s+up\s+(an?\s+)?(automation|workflow|rule)/i],
    category: 'system',
    urgency: 'medium',
    estimatedRisk: 'HIGH_RISK',
  },
  {
    type: 'payment',
    label: 'Payment',
    keywords: ['pago', 'cobrar', 'factura', 'invoice', 'payment', 'cobro', 'precio', 'price', 'costo', 'cost', 'stripe', 'mercado pago'],
    patterns: [/genera(r)?\s+(una\s+)?(factura|cobro|link\s+de\s+pago)/i, /create\s+(an?\s+)?(invoice|payment\s+link)/i],
    category: 'finance',
    urgency: 'high',
    estimatedRisk: 'HIGH_RISK',
  },
  {
    type: 'ai_generate',
    label: 'AI Generate',
    keywords: ['genera', 'redactar', 'escribir', 'generate', 'draft', 'create', 'resumen', 'summary', 'ia', 'ai', 'gpt', 'respuesta'],
    patterns: [/genera(r)?\s+(una\s+)?(respuesta|propuesta|resumen)/i, /write\s+(a|an)\s+(response|proposal|summary|email)/i],
    category: 'ai',
    urgency: 'low',
    estimatedRisk: 'SAFE',
  },
]

// ─── Urgency Boosters ──────────────────────────────────────
// Keywords that boost urgency regardless of intent type

const URGENCY_BOOSTERS: Record<string, 'high' | 'critical'> = {
  'urgente': 'high', 'urgent': 'high', 'ya': 'high', 'now': 'high', 'inmediato': 'critical',
  'asap': 'critical', 'hoy': 'high', 'today': 'high', 'emergency': 'critical',
  'crítico': 'critical', 'critical': 'critical', 'vencido': 'high', 'overdue': 'high',
}

// ─── Risk Boosters ─────────────────────────────────────────
// Keywords that may increase estimated risk

const RISK_BOOSTERS: RiskLevel[] = []
const RISK_BOOSTER_KEYWORDS: Record<string, RiskLevel> = {
  'eliminar': 'HIGH_RISK', 'delete': 'HIGH_RISK', 'borrar': 'HIGH_RISK',
  'cancelar': 'HIGH_RISK', 'cancel': 'HIGH_RISK',
  'massivo': 'CRITICAL', 'masivo': 'CRITICAL', 'bulk': 'CRITICAL',
  'todos': 'HIGH_RISK', 'all': 'HIGH_RISK', 'global': 'CRITICAL',
}

// ═══════════════════════════════════════════════════════════════
// IntentClassifier
// ═══════════════════════════════════════════════════════════════

export class IntentClassifier {

  // ─────────────────────────────────────────────────────────
  // 1. CLASSIFY — Main entry point
  // Takes raw input and returns a structured classification
  // ─────────────────────────────────────────────────────────

  static async classify(
    workspaceId: string,
    rawInput: string,
    context?: {
      sessionId?: string
      contactId?: string
      agentId?: string
      correlationId?: string
    },
  ): Promise<IntentClassification> {
    logInfo(TAG, 'classify_start', { workspaceId, inputLength: rawInput.length })

    try {
      // Step 1: Match against intent patterns
      const match = IntentClassifier.matchPatterns(rawInput)

      // Step 2: Extract entities from input
      const entities = IntentClassifier.extractEntities(rawInput)

      // Step 3: Determine urgency
      const urgency = IntentClassifier.determineUrgency(rawInput, match.urgency)

      // Step 4: Determine risk level
      const riskLevel = IntentClassifier.determineRisk(rawInput, match.estimatedRisk)

      // Step 5: Find matching tool contract
      const toolMatch = await IntentClassifier.findBestTool(
        workspaceId,
        match.type,
        match.category,
      )

      // Step 6: Build classification
      const classification: IntentClassification = {
        intentType: match.type,
        description: match.label,
        confidence: match.confidence,
        entities,
        urgency,
        suggestedToolId: toolMatch?.contractId ?? null,
        suggestedToolSlug: toolMatch?.slug ?? null,
        resolutionStrategy: toolMatch ? IntentClassifier.getResolutionStrategy(match.confidence, riskLevel) : 'manual',
        estimatedRiskLevel: riskLevel,
      }

      // Step 7: Persist IntentRecord
      await IntentClassifier.persistRecord(
        workspaceId,
        classification,
        rawInput,
        context,
        toolMatch?.contractId,
      )

      // Step 8: Emit event
      eventBus.emit(TOOL_RUNTIME_EVENTS.INTENT_CLASSIFIED, {
        workspaceId,
        intentType: classification.intentType,
        confidence: classification.confidence,
        suggestedToolId: classification.suggestedToolId,
        urgency: classification.urgency,
      }, 'tool-runtime')

      logOk(TAG, 'classify_complete', {
        workspaceId,
        intentType: classification.intentType,
        confidence: classification.confidence.toFixed(3),
        suggestedTool: classification.suggestedToolSlug,
      })

      return classification
    } catch (err) {
      logError(TAG, 'classify_error', err, { workspaceId })

      // Return safe fallback classification
      return {
        intentType: 'unknown',
        description: 'Unable to classify intent',
        confidence: 0,
        entities: {},
        urgency: 'medium',
        suggestedToolId: null,
        suggestedToolSlug: null,
        resolutionStrategy: 'manual',
        estimatedRiskLevel: 'SAFE',
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. MATCH PATTERNS — Score each pattern against input
  // Returns the best matching intent pattern
  // ─────────────────────────────────────────────────────────

  private static matchPatterns(
    input: string,
  ): { type: string; label: string; confidence: number; category: string; urgency: 'low'|'medium'|'high'|'critical'; estimatedRisk: RiskLevel } {
    const normalized = input.toLowerCase().trim()
    let bestMatch: { type: string; label: string; confidence: number; category: string; urgency: 'low'|'medium'|'high'|'critical'; estimatedRisk: RiskLevel } = {
      type: 'unknown',
      label: 'Unknown Intent',
      confidence: 0,
      category: 'general',
      urgency: 'medium',
      estimatedRisk: 'SAFE',
    }

    for (const pattern of INTENT_PATTERNS) {
      let score = 0
      let maxScore = 0

      // Keyword matching (1 point per keyword found)
      for (const keyword of pattern.keywords) {
        maxScore += 1
        if (normalized.includes(keyword.toLowerCase())) {
          score += 1
        }
      }

      // Regex pattern matching (3 points per match — stronger signal)
      for (const regex of pattern.patterns) {
        maxScore += 3
        if (regex.test(input)) {
          score += 3
        }
      }

      // Calculate confidence
      const confidence = maxScore > 0 ? Math.min(1, score / maxScore) : 0

      // Boost confidence if we have multiple keyword matches
      if (score >= 2) {
        const boostedConfidence = Math.min(1, confidence * 1.3)
        if (boostedConfidence > bestMatch.confidence) {
          bestMatch = {
            type: pattern.type,
            label: pattern.label,
            confidence: boostedConfidence,
            category: pattern.category,
            urgency: pattern.urgency,
            estimatedRisk: pattern.estimatedRisk,
          }
        }
      } else if (confidence > bestMatch.confidence) {
        bestMatch = {
          type: pattern.type,
          label: pattern.label,
          confidence,
          category: pattern.category,
          urgency: pattern.urgency,
          estimatedRisk: pattern.estimatedRisk,
        }
      }
    }

    return bestMatch
  }

  // ─────────────────────────────────────────────────────────
  // 3. EXTRACT ENTITIES — Pull structured data from input
  // Identifies: contact names, phone numbers, emails, dates, amounts
  // ─────────────────────────────────────────────────────────

  private static extractEntities(input: string): Record<string, unknown> {
    const entities: Record<string, unknown> = {}

    // Phone numbers (MX format: +52 or 10 digits, international)
    const phoneMatch = input.match(/(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/)
    if (phoneMatch) entities.phone = phoneMatch[0].trim()

    // Email addresses
    const emailMatch = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (emailMatch) entities.email = emailMatch[0]

    // Date patterns (DD/MM/YYYY, YYYY-MM-DD, relative dates)
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /\d{4}-\d{2}-\d{2}/,
      /(mañana|tomorrow)/i,
      /(hoy|today)/i,
      /(próximo\s+\w+|next\s+\w+)/i,
    ]
    for (const dp of datePatterns) {
      const m = input.match(dp)
      if (m) { entities.date = m[0]; break }
    }

    // Currency amounts (MXN format)
    const amountMatch = input.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:MXN|mxn|pesos?)?/)
    if (amountMatch) entities.amount = { value: parseFloat(amountMatch[1].replace(',', '')), currency: 'MXN' }

    // Contact name detection (capitalized words that look like names)
    const nameMatch = input.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/)
    if (nameMatch && !['Que Pasa', 'Por Favor', 'Buenos Dias', 'Buenas Tardes', 'Buenas Noches'].includes(nameMatch[0])) {
      entities.possibleName = nameMatch[0]
    }

    // Message content detection (quoted text)
    const quoteMatch = input.match(/["«](.+?)["»]/)
    if (quoteMatch) entities.messageContent = quoteMatch[1]

    return entities
  }

  // ─────────────────────────────────────────────────────────
  // 4. DETERMINE URGENCY — Check for urgency boosters
  // ─────────────────────────────────────────────────────────

  private static determineUrgency(
    input: string,
    baseUrgency: 'low' | 'medium' | 'high' | 'critical',
  ): 'low' | 'medium' | 'high' | 'critical' {
    const normalized = input.toLowerCase()

    for (const [keyword, urgency] of Object.entries(URGENCY_BOOSTERS)) {
      if (normalized.includes(keyword.toLowerCase())) {
        return Math.max(
          ['low', 'medium', 'high', 'critical'].indexOf(urgency),
          ['low', 'medium', 'high', 'critical'].indexOf(baseUrgency),
        ) === ['low', 'medium', 'high', 'critical'].indexOf(urgency)
          ? urgency
          : baseUrgency
      }
    }

    return baseUrgency
  }

  // ─────────────────────────────────────────────────────────
  // 5. DETERMINE RISK — Check for risk boosters
  // ─────────────────────────────────────────────────────────

  private static determineRisk(
    input: string,
    baseRisk: RiskLevel,
  ): RiskLevel {
    const normalized = input.toLowerCase()
    const riskOrder: Record<RiskLevel, number> = { SAFE: 0, MODERATE: 1, HIGH_RISK: 2, CRITICAL: 3 }

    let boostedRisk = baseRisk

    for (const [keyword, risk] of Object.entries(RISK_BOOSTER_KEYWORDS)) {
      if (normalized.includes(keyword.toLowerCase())) {
        if (riskOrder[risk] > riskOrder[boostedRisk]) {
          boostedRisk = risk
        }
      }
    }

    return boostedRisk
  }

  // ─────────────────────────────────────────────────────────
  // 6. FIND BEST TOOL — Match intent to active tool contracts
  // ─────────────────────────────────────────────────────────

  private static async findBestTool(
    workspaceId: string,
    intentType: string,
    preferredCategory: string,
  ): Promise<{ contractId: string; slug: string; confidence: number } | null> {
    try {
      // First try: match by category
      const categoryMatch = await db.toolContract.findFirst({
        where: {
          workspaceId,
          category: preferredCategory,
          isActive: true,
        },
        orderBy: { riskLevel: 'asc' }, // Prefer safer tools
      })

      if (categoryMatch) {
        return {
          contractId: categoryMatch.id,
          slug: categoryMatch.slug,
          confidence: 0.8,
        }
      }

      // Second try: match by slug/name containing intent type
      const slugMatch = await db.toolContract.findFirst({
        where: {
          workspaceId,
          isActive: true,
          OR: [
            { slug: { contains: intentType.replace('_', '_') } },
            { name: { contains: intentType.replace('_', ' ') } },
          ],
        },
        orderBy: { riskLevel: 'asc' },
      })

      if (slugMatch) {
        return {
          contractId: slugMatch.id,
          slug: slugMatch.slug,
          confidence: 0.6,
        }
      }

      // Third try: any active tool in workspace
      const anyTool = await db.toolContract.findFirst({
        where: { workspaceId, isActive: true },
        orderBy: { riskLevel: 'asc' },
      })

      if (anyTool) {
        return {
          contractId: anyTool.id,
          slug: anyTool.slug,
          confidence: 0.3,
        }
      }

      return null
    } catch (err) {
      logError(TAG, 'find_tool_error', err, { workspaceId })
      return null
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. GET RESOLUTION STRATEGY — Decide auto vs manual
  // ─────────────────────────────────────────────────────────

  private static getResolutionStrategy(
    confidence: number,
    risk: RiskLevel,
  ): 'automatic' | 'manual' | 'hybrid' {
    // High confidence + low risk = automatic
    if (confidence >= 0.7 && risk === 'SAFE') return 'automatic'
    // High confidence + moderate risk = hybrid
    if (confidence >= 0.7 && risk === 'MODERATE') return 'hybrid'
    // Low confidence = manual
    if (confidence < 0.4) return 'manual'
    // High risk = manual
    if (risk === 'HIGH_RISK' || risk === 'CRITICAL') return 'manual'
    // Default = hybrid
    return 'hybrid'
  }

  // ─────────────────────────────────────────────────────────
  // 8. PERSIST RECORD — Save IntentRecord to DB
  // ─────────────────────────────────────────────────────────

  private static async persistRecord(
    workspaceId: string,
    classification: IntentClassification,
    rawInput: string,
    context?: {
      sessionId?: string
      contactId?: string
      agentId?: string
      correlationId?: string
    },
    resolvedToolId?: string,
  ): Promise<string | null> {
    try {
      const record = await db.intentRecord.create({
        data: {
          workspaceId,
          intentType: classification.intentType,
          intentPayload: JSON.stringify({
            description: classification.description,
            confidence: classification.confidence,
            entities: classification.entities,
            urgency: classification.urgency,
          }),
          rawInput,
          resolvedToolId: resolvedToolId,
          resolutionStrategy: classification.resolutionStrategy,
          resolutionConfidence: classification.confidence,
          status: 'detected',
          sessionId: context?.sessionId,
          contactId: context?.contactId,
          agentId: context?.agentId,
          correlationId: context?.correlationId,
        },
      })

      return record.id
    } catch (err) {
      logError(TAG, 'persist_error', err, { workspaceId })
      return null
    }
  }
}

export default IntentClassifier
