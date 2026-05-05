// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow + NEXUS — Dual Agent Orchestrator
// Central brain that routes between commercial (ValiAutoFlow)
// and emotional (NEXUS) modes using AI classification.
// ═══════════════════════════════════════════════════════════════

import { chatWithAI, chatWithAIJson, type AIMessage } from '@/lib/ai/providers'
import {
  detectLeadStage,
  buildValiAutoFlowSystemPrompt,
  getAgentName,
  getStageLabel,
  getAgentLabel,
  generateConversationSummary,
  detectPain,
  detectCostAcknowledgment,
} from '@/lib/ai/valiautoflow-system'
import { leadProfiler } from '@/lib/ai/lead-profiler'
import { db } from '@/lib/db'
import { debug } from '@/lib/logger'
import type { ValiAutoFlowStage, ValiAutoFlowAgent } from '@/lib/types'

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** The primary classification of the user's message. */
export type OrchestratorIntent = 'commercial' | 'emotional' | 'mixed'

/** Which subsystem handled the response. */
export type ActiveMode = 'valiautoflow' | 'nexus' | 'blended'

/** Input to the orchestrator's processMessage method. */
export interface OrchestratorInput {
  /** The latest message from the contact/user. */
  message: string
  /** Phone or unique identifier for the contact. */
  contactId?: string
  /** Workspace ID (for multi-tenant context). */
  workspaceId?: string
  /** Full conversation history (role + content). */
  conversationHistory: Array<{ role: string; content: string }>
  /** Known contact name for personalization. */
  contactName?: string
  /** Current lead score (0-100) from CRM. */
  leadScore?: number
  /** Contact tags from CRM. */
  tags?: string[]
  /** Force a specific mode (for testing / override). */
  forceMode?: ActiveMode
  /** Language preference. */
  language?: string
  /** Business name for commercial context. */
  businessName?: string
  /** Industry context. */
  industry?: string
  /** Contact channel. */
  channel?: string
}

/** Structured response from the orchestrator. */
export interface OrchestratorOutput {
  /** The AI-generated reply text. */
  response: string
  /** Which mode was active for this turn. */
  mode: ActiveMode
  /** The classified intent for this message. */
  intent: OrchestratorIntent
  /** Confidence score of the classification (0-1). */
  confidence: number
  /** If commercial: which ValiAutoFlow agent handled it. */
  valiautoflowAgent?: ValiAutoFlowAgent
  /** If commercial: which stage the lead is in. */
  valiautoflowStage?: ValiAutoFlowStage
  /** AI model used for the response. */
  model: string
  /** Tokens consumed by the response generation call. */
  tokensUsed: number
  /** Total latency of the orchestration pipeline in ms. */
  latencyMs: number
  /** Reasoning trace for debugging. */
  reasoning: string
  /** Structured events emitted during this orchestration. */
  events: OrchestratorEvent[]
  /** Lead profile context used (if available). */
  profileContext?: string
}

/** An event emitted during orchestration (for event bus integration). */
export interface OrchestratorEvent {
  type: string
  timestamp: Date
  data: Record<string, unknown>
}

/** The classification result from the AI. */
interface ClassificationResult {
  intent: OrchestratorIntent
  confidence: number
  reasoning: string
  emotionalSignals: string[]
  commercialSignals: string[]
}

/** Internal context built before routing. */
interface RoutingContext {
  input: OrchestratorInput
  classification: ClassificationResult
  mode: ActiveMode
  contactMemories: ContactMemory[]
  profileContext: string
  conversationSummary: string
  painDetected: boolean
  costAcknowledged: boolean
  detectedStage: ValiAutoFlowStage
}

/** Contact memory entry. */
interface ContactMemory {
  key: string
  value: string
  category: string
  importance: number
}

// ═══════════════════════════════════════════════════════════════
// EVENT EMITTER (Simple replaceable pattern)
// ═══════════════════════════════════════════════════════════════

type EventListener = (event: OrchestratorEvent) => void

/**
 * Lightweight EventEmitter for orchestrator events.
 * Can be replaced with a real event bus later.
 */
class OrchestratorEventBus {
  private listeners = new Map<string, Set<EventListener>>()

  on(eventType: string, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)
    return () => this.listeners.get(eventType)?.delete(listener)
  }

  off(eventType: string, listener: EventListener): void {
    this.listeners.get(eventType)?.delete(listener)
  }

  emit(eventType: string, data: Record<string, unknown>): void {
    const event: OrchestratorEvent = {
      type: eventType,
      timestamp: new Date(),
      data,
    }
    const listeners = this.listeners.get(eventType)
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event) } catch (e) { console.error('[OrchestratorEventBus] Listener error:', e) }
      }
    }
    // Also notify wildcard listeners
    const wildcardListeners = this.listeners.get('*')
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try { listener(event) } catch (e) { console.error('[OrchestratorEventBus] Wildcard listener error:', e) }
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}

// Global event bus singleton
export const orchestratorEventBus = new OrchestratorEventBus()

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const CLASSIFICATION_SYSTEM_PROMPT = `You are a message intent classifier for a dual-agent AI system. Your job is to determine whether the incoming message requires a COMMERCIAL response or an EMOTIONAL/SOCIAL response.

## CLASSIFICATION CRITERIA

### COMMERCIAL — Route to ValiAutoFlow when:
- The message contains buying signals (quiere comprar, precio, cuánto cuesta, agendar, demo)
- The person is asking about products, services, plans, or features
- The message mentions business needs, sales, leads, automation
- There are commercial objections (no tengo presupuesto, muy caro, ya tengo alguien)
- The conversation has been actively commercial and the person is advancing in a sales funnel
- The person asks about ROI, results, case studies, testimonials
- The message is a follow-up about a previous commercial conversation

### EMOTIONAL — Route to NEXUS when:
- The message is a greeting without commercial context (hola, buenos días, qué onda)
- The person is sharing personal feelings, frustrations, or life events
- The message is casual conversation unrelated to business
- The person is venting or seeking empathy/support
- The message is about personal relationships, family, stress, motivation
- The conversation is in an early rapport-building phase with no commercial signals
- The person is asking for advice on personal topics

### MIXED — When both are present:
- The person mentions both personal context AND commercial interest
- "Estoy estresado con mi negocio, necesito algo que me ayude"
- "Mi esposa está embarazada, quiero invertir en algo seguro"
- The emotional context is directly tied to a commercial need

## OUTPUT FORMAT
Respond with ONLY a JSON object (no markdown, no explanation):
{
  "intent": "commercial" | "emotional" | "mixed",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why you classified it this way",
  "emotional_signals": ["list", "of", "detected", "emotional", "signals"],
  "commercial_signals": ["list", "of", "detected", "commercial", "signals"]
}

If no signals are detected, default to "emotional" with confidence 0.5.`

// ═══════════════════════════════════════════════════════════════
// NEXUS SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

function buildNexusSystemPrompt(context: {
  contactName?: string
  conversationSummary: string
  memories: ContactMemory[]
  language?: string
}): string {
  const lang = context.language || 'español'
  const memoryBlock = context.memories.length > 0
    ? context.memories.map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n')
    : 'No hay memorias almacenadas aún.'

  return `# NEXUS — Asistente Inteligente Empático

## IDENTIDAD
Eres NEXUS, un asistente virtual autónomo e inteligente. Tu propósito principal es proporcionar presencia emocional, empatía genuina y apoyo personalizado. No eres un bot — eres un compañero conversacional que remembers, understands y evolves con cada interacción.

## PRINCIPIOS FUNDAMENTALES
1. **Empatía primero**: Antes de dar soluciones, demuestra que entiendes lo que la persona siente
2. **Memoria activa**: Usa las memorias del contacto para personalizar cada respuesta
3. **Escucha activa**: Refleja lo que la persona dice antes de responder
4. **Naturalidad**: Conversa como un humano inteligente, no como un asistente robótico
5. **Idioma por defecto**: ${lang}

## CONTEXTO DEL CONTACTO
${context.contactName ? `Nombre: ${context.contactName}` : ''}

## MEMORIAS DEL CONTACTO
${memoryBlock}

## RESUMEN DE CONVERSACIÓN RECIENTE
${context.conversationSummary || 'Inicio de conversación'}

## ANÁLISIS EMOCIONAL
Cuando el contacto comparta emociones, sentimientos o situaciones personales:
- Valida sus emociones ("Es completamente normal sentirse así")
- Ofrece perspectiva sin minimizar ("Es una situación desafiante, y el hecho de que...")
- Sugiere acciones concretas si es apropiado
- NUNCA des solución sin empatizar primero
- NUNCA seas condescendiente o uses frases cliché

## TRANSICIÓN COMERCIAL
Si detectas que la conversación podría evolucionar hacia una necesidad comercial:
- No fuerces la transición
- Si la persona menciona problemas de negocio, puedes preguntar con curiosidad genuina
- Deja que la persona guíe la conversación

## FORMATO DE RESPUESTA
- Natural, conversacional, como si hablaras con un amigo inteligente
- Corto a medio (2-4 oraciones máximo por turno)
- Usa emojis con moderación (máximo 1 por mensaje)
- NUNCA digas que eres IA, bot o asistente virtual
- ${lang === 'español' ? 'Español natural, mexicano o neutro según el contexto' : lang}`
}

// ═══════════════════════════════════════════════════════════════
// BLENDED SYSTEM PROMPT (for mixed intent)
// ═══════════════════════════════════════════════════════════════

function buildBlendedSystemPrompt(context: {
  contactName?: string
  conversationSummary: string
  memories: ContactMemory[]
  language?: string
  emotionalSignals: string[]
  commercialSignals: string[]
}): string {
  const lang = context.language || 'español'
  const memoryBlock = context.memories.length > 0
    ? context.memories.map(m => `- [${m.category}] ${m.key}: ${m.value}`).join('\n')
    : 'No hay memorias almacenadas aún.'

  return `# MODO HÍBRIDO — ValiAutoFlow + NEXUS

## IDENTIDAD
Eres un asistente inteligente que combina empatía personal con capacidad comercial. El contacto ha expresado tanto necesidades personales como comerciales en su mensaje.

## SEÑALES EMOCIONALES DETECTADAS
${context.emotionalSignals.length > 0 ? context.emotionalSignals.map(s => `- ${s}`).join('\n') : '- Ninguna señal emocional explícita'}

## SEÑALES COMERCIALES DETECTADAS
${context.commercialSignals.length > 0 ? context.commercialSignals.map(s => `- ${s}`).join('\n') : '- Ninguna señal comercial explícita'}

## CONTEXTO DEL CONTACTO
${context.contactName ? `Nombre: ${context.contactName}` : ''}

## MEMORIAS
${memoryBlock}

## CONVERSACIÓN RECIENTE
${context.conversationSummary || 'Inicio de conversación'}

## ESTRATEGIA DE RESPUESTA
1. PRIMERO: Reconoce y valida el aspecto emocional/personal
2. SEGUNDO: Conecta ese aspecto personal con la necesidad comercial
3. TERCERO: Ofrece un puente natural hacia una solución (sin ser agresivo)
4. La empatía debe sentirse genuina, no como un truco de ventas

## FORMATO
- Natural y cálido, sin sonar como ventas
- Máximo 3-4 oraciones
- Idioma: ${lang}
- NUNCA digas que eres IA
- Usa emojis con moderación`
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATION MODE TRACKER (per contact)
// ═══════════════════════════════════════════════════════════════

interface ModeHistory {
  currentMode: ActiveMode
  modeCounts: Record<ActiveMode, number>
  lastTransitionAt: Date
  totalTurns: number
}

const modeHistory = new Map<string, ModeHistory>()
const MODE_HISTORY_TTL = 4 * 60 * 60 * 1000 // 4 hours

function getModeHistory(contactId: string): ModeHistory {
  const existing = modeHistory.get(contactId)
  if (existing && (Date.now() - existing.lastTransitionAt.getTime()) < MODE_HISTORY_TTL) {
    return existing
  }
  const fresh: ModeHistory = {
    currentMode: 'nexus',
    modeCounts: { valiautoflow: 0, nexus: 0, blended: 0 },
    lastTransitionAt: new Date(),
    totalTurns: 0,
  }
  modeHistory.set(contactId, fresh)
  return fresh
}

function updateModeHistory(contactId: string, newMode: ActiveMode): void {
  const history = getModeHistory(contactId)
  history.currentMode = newMode
  history.modeCounts[newMode]++
  history.lastTransitionAt = new Date()
  history.totalTurns++
}

// Cleanup mode history every 30 min
setInterval(() => {
  const now = Date.now()
  for (const [key, history] of modeHistory.entries()) {
    if (now - history.lastTransitionAt.getTime() > MODE_HISTORY_TTL) {
      modeHistory.delete(key)
    }
  }
}, 30 * 60 * 1000)

// ═══════════════════════════════════════════════════════════════
// DUAL AGENT ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

export class DualAgentOrchestrator {
  private readonly provider: string
  private readonly events: OrchestratorEvent[] = []

  constructor(provider: string = 'glm') {
    this.provider = provider
  }

  // ─── PUBLIC API ────────────────────────────────────────────

  /**
   * Process a message through the full orchestration pipeline.
   * This is the main entry point.
   */
  async processMessage(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const startTime = Date.now()
    this.events.length = 0 // Reset events for this turn
    const contactId = input.contactId || 'anonymous'

    debug(`[Orchestrator] Processing message: "${input.message.slice(0, 80)}..."`)

    // Step 1: Load memories and profile context
    const { memories, profileContext } = await this.loadContext(input)
    this.emitEvent('context_loaded', {
      contactId,
      memoryCount: memories.length,
      hasProfileContext: !!profileContext,
    })

    // Step 2: Build conversation summary
    const conversationSummary = generateConversationSummary(input.conversationHistory)

    // Step 3: Detect behavioral signals
    const painDetected = detectPain(input.message, input.conversationHistory)
    const costAcknowledged = detectCostAcknowledgment(input.message, input.conversationHistory)
    const stageDetection = detectLeadStage(input.message, input.conversationHistory)
    const detectedStage = stageDetection.stage

    // Step 4: Classify intent (AI-based)
    let classification: ClassificationResult
    if (input.forceMode) {
      classification = this.buildForcedClassification(input.forceMode)
      debug(`[Orchestrator] Forced mode: ${input.forceMode}`)
    } else {
      classification = await this.classifyIntent(input.message, {
        memories,
        profileContext,
        conversationSummary,
        leadScore: input.leadScore,
        conversationHistory: input.conversationHistory,
      })
    }

    this.emitEvent('intent_classified', {
      contactId,
      intent: classification.intent,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
    })

    // Step 5: Determine mode with hysteresis (avoid rapid switching)
    const mode = this.determineMode(classification, contactId, input)

    this.emitEvent('mode_determined', {
      contactId,
      mode,
      previousMode: getModeHistory(contactId).currentMode,
    })

    // Step 6: Build routing context
    const routingContext: RoutingContext = {
      input,
      classification,
      mode,
      contactMemories: memories,
      profileContext,
      conversationSummary,
      painDetected,
      costAcknowledged,
      detectedStage,
    }

    // Step 7: Route to appropriate handler
    let result: OrchestratorOutput

    switch (mode) {
      case 'valiautoflow':
        result = await this.routeToValiAutoFlow(routingContext)
        break
      case 'nexus':
        result = await this.routeToNexus(routingContext)
        break
      case 'blended':
        result = await this.handleMixedIntent(routingContext)
        break
      default:
        result = await this.routeToNexus(routingContext)
    }

    // Step 8: Update mode history
    updateModeHistory(contactId, mode)

    // Step 9: Persist conversation memories (non-blocking)
    this.extractAndPersistMemories(input, result, contactId).catch((err) => {
      debug(`[Orchestrator] Memory persistence failed (non-critical): ${err instanceof Error ? err.message : err}`)
    })

    const totalLatency = Date.now() - startTime
    this.emitEvent('orchestration_complete', {
      contactId,
      mode: result.mode,
      intent: result.intent,
      latencyMs: totalLatency,
      tokensUsed: result.tokensUsed,
    })

    return {
      ...result,
      latencyMs: totalLatency,
      events: [...this.events],
      profileContext: profileContext || undefined,
    }
  }

  /**
   * Classify a message's intent using AI.
   * Returns commercial, emotional, or mixed with confidence.
   */
  async classifyIntent(
    message: string,
    context: {
      memories: ContactMemory[]
      profileContext: string
      conversationSummary: string
      leadScore?: number
      conversationHistory: Array<{ role: string; content: string }>
    }
  ): Promise<ClassificationResult> {
    const recentHistory = context.conversationHistory.slice(-10)

    // Build context for the classifier
    const historyContext = recentHistory
      .map((m) => `${m.role === 'user' ? 'Contact' : 'Assistant'}: ${m.content.slice(0, 100)}`)
      .join('\n')

    const userMessages = context.conversationHistory.filter(m => m.role === 'user' || m.role === 'contact')
    const isDeepConversation = userMessages.length > 5

    const classifyMessages: AIMessage[] = [
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `## MESSAGE TO CLASSIFY
"${message}"

## CONVERSATION DEPTH
${isDeepConversation ? 'Deep conversation (' + userMessages.length + ' user messages)' : 'Early conversation (' + userMessages.length + ' user messages)'}

## LEAD SCORE (if available)
${context.leadScore !== undefined ? `${context.leadScore}/100` : 'Not available'}

## PROFILE CONTEXT
${context.profileContext || 'No profile context'}

## RECENT CONVERSATION
${historyContext || 'No previous messages'}

Classify this message NOW. Return ONLY the JSON object.`,
      },
    ]

    try {
      const { data } = await chatWithAIJson<ClassificationResult>(
        classifyMessages,
        this.provider,
        undefined,
        { temperature: 0.1, maxTokens: 300, frequencyPenalty: 0, presencePenalty: 0 }
      )

      // Validate and sanitize
      const validIntents: OrchestratorIntent[] = ['commercial', 'emotional', 'mixed']
      if (!validIntents.includes(data.intent)) {
        data.intent = 'emotional'
      }
      data.confidence = Math.max(0, Math.min(1, data.confidence || 0.5))
      data.reasoning = data.reasoning || 'Classification completed'
      // Map snake_case from AI JSON to camelCase
      const raw = data as unknown as Record<string, unknown>
      data.emotionalSignals = Array.isArray(raw.emotional_signals) ? (raw.emotional_signals as string[]) : []
      data.commercialSignals = Array.isArray(raw.commercial_signals) ? (raw.commercial_signals as string[]) : []

      return data
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.warn(`[Orchestrator] AI classification failed (${errMsg}), using heuristic fallback`)
      return this.heuristicFallback(message, context)
    }
  }

  /**
   * Route to ValiAutoFlow commercial pipeline.
   */
  async routeToValiAutoFlow(context: RoutingContext): Promise<OrchestratorOutput> {
    const { input, detectedStage, conversationSummary, profileContext } = context
    const agentName = getAgentName(detectedStage)
    const agentLabel = getAgentLabel(agentName)
    const stageLabel = getStageLabel(detectedStage)

    debug(`[Orchestrator] Routing to ValiAutoFlow: ${agentLabel} (${stageLabel})`)

    // Build ValiAutoFlow system prompt
    const systemPrompt = buildValiAutoFlowSystemPrompt(detectedStage, agentName, {
      businessName: input.businessName,
      contactName: input.contactName,
      painDetected: context.painDetected,
      costAcknowledged: context.costAcknowledged,
      conversationSummary: conversationSummary.slice(0, 500),
      messagesInStage: this.countMessagesInCurrentStage(input.conversationHistory),
    })

    // Inject profile context if available
    const fullSystemPrompt = profileContext
      ? `${systemPrompt}\n\n---\n\n${profileContext}`
      : systemPrompt

    // Build message array
    const messages: AIMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      ...input.conversationHistory.slice(-20).map(m => ({
        role: (m.role === 'user' || m.role === 'contact' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Call AI
    const startTime = Date.now()
    const result = await chatWithAI(messages, this.provider, undefined, {
      temperature: 0.75,
      maxTokens: 1024,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    })

    this.emitEvent('valiautoflow_response', {
      agent: agentName,
      stage: detectedStage,
      responseLength: result.content.length,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startTime,
    })

    return {
      response: result.content,
      mode: 'valiautoflow',
      intent: context.classification.intent,
      confidence: context.classification.confidence,
      valiautoflowAgent: agentName,
      valiautoflowStage: detectedStage,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startTime,
      reasoning: `Routed to ValiAutoFlow ${agentLabel} at stage ${stageLabel}. ${context.classification.reasoning}`,
      events: this.events,
    }
  }

  /**
   * Route to NEXUS emotional/intelligence system.
   */
  async routeToNexus(context: RoutingContext): Promise<OrchestratorOutput> {
    const { input, contactMemories, conversationSummary } = context

    debug(`[Orchestrator] Routing to NEXUS (emotional mode)`)

    // Build NEXUS system prompt
    const systemPrompt = buildNexusSystemPrompt({
      contactName: input.contactName,
      conversationSummary: conversationSummary.slice(0, 500),
      memories: contactMemories,
      language: input.language,
    })

    // Build message array
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...input.conversationHistory.slice(-20).map(m => ({
        role: (m.role === 'user' || m.role === 'contact' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Call AI
    const startTime = Date.now()
    const result = await chatWithAI(messages, this.provider, undefined, {
      temperature: 0.7,
      maxTokens: 1024,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    })

    this.emitEvent('nexus_response', {
      responseLength: result.content.length,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startTime,
    })

    return {
      response: result.content,
      mode: 'nexus',
      intent: context.classification.intent,
      confidence: context.classification.confidence,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startTime,
      reasoning: `Routed to NEXUS (emotional mode). ${context.classification.reasoning}`,
      events: this.events,
    }
  }

  /**
   * Handle mixed intent — blend empathy with commercial awareness.
   */
  async handleMixedIntent(context: RoutingContext): Promise<OrchestratorOutput> {
    const { input, contactMemories, conversationSummary, classification } = context

    debug(`[Orchestrator] Handling mixed intent — blended mode`)

    // Build blended system prompt
    const systemPrompt = buildBlendedSystemPrompt({
      contactName: input.contactName,
      conversationSummary: conversationSummary.slice(0, 500),
      memories: contactMemories,
      language: input.language,
      emotionalSignals: classification.emotionalSignals,
      commercialSignals: classification.commercialSignals,
    })

    // Build message array
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...input.conversationHistory.slice(-20).map(m => ({
        role: (m.role === 'user' || m.role === 'contact' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Call AI
    const startTime = Date.now()
    const result = await chatWithAI(messages, this.provider, undefined, {
      temperature: 0.72,
      maxTokens: 1024,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    })

    this.emitEvent('blended_response', {
      emotionalSignals: classification.emotionalSignals,
      commercialSignals: classification.commercialSignals,
      responseLength: result.content.length,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startTime,
    })

    return {
      response: result.content,
      mode: 'blended',
      intent: classification.intent,
      confidence: classification.confidence,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startTime,
      reasoning: `Blended mode — emotional signals: [${classification.emotionalSignals.join(', ')}], commercial signals: [${classification.commercialSignals.join(', ')}]. ${classification.reasoning}`,
      events: this.events,
    }
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────

  /**
   * Load contact memories and profile context from DB.
   */
  private async loadContext(input: OrchestratorInput): Promise<{
    memories: ContactMemory[]
    profileContext: string
  }> {
    let memories: ContactMemory[] = []
    let profileContext = ''

    if (!input.contactId) return { memories, profileContext }

    try {
      // Load NexusMemories (personal memories)
      const nexusMemories = await db.nexusMemory.findMany({
        where: { userId: input.contactId },
        orderBy: { importance: 'desc' },
        take: 10,
      })
      memories = nexusMemories.map(m => ({
        key: m.key,
        value: m.value,
        category: m.category,
        importance: m.importance,
      }))

      // Load lead profile context
      const profile = await leadProfiler.getProfile(input.contactId)
      if (profile) {
        profileContext = leadProfiler.buildProfileContext(profile)
      }
    } catch (err) {
      debug(`[Orchestrator] Context loading failed (non-critical): ${err instanceof Error ? err.message : err}`)
    }

    return { memories, profileContext }
  }

  /**
   * Determine the active mode with hysteresis to prevent rapid switching.
   */
  private determineMode(
    classification: ClassificationResult,
    contactId: string,
    input: OrchestratorInput
  ): ActiveMode {
    // Forced mode overrides everything
    if (input.forceMode) return input.forceMode

    const history = getModeHistory(contactId)

    // Hysteresis: If the conversation has been in commercial mode for 3+ turns,
    // require higher confidence to switch to emotional.
    const commercialTurns = history.modeCounts.valiautoflow
    const confidenceThreshold = commercialTurns >= 3 ? 0.75 : 0.55

    // If currently in ValiAutoFlow and commercial intent, stay
    if (history.currentMode === 'valiautoflow' && classification.intent === 'commercial') {
      return 'valiautoflow'
    }

    // If currently in ValiAutoFlow but emotional intent, require high confidence to switch
    if (history.currentMode === 'valiautoflow' && classification.intent === 'emotional') {
      if (classification.confidence < confidenceThreshold) {
        return 'valiautoflow' // Stay in commercial mode
      }
      return 'nexus'
    }

    // Mixed intent always goes to blended
    if (classification.intent === 'mixed') {
      return 'blended'
    }

    // Direct mapping
    if (classification.intent === 'commercial') {
      return 'valiautoflow'
    }

    // Default: emotional → nexus
    return 'nexus'
  }

  /**
   * Heuristic fallback when AI classification fails.
   */
  private heuristicFallback(
    message: string,
    context: {
      conversationHistory: Array<{ role: string; content: string }>
      profileContext: string
    }
  ): ClassificationResult {
    const normalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const emotionalKeywords = [
      'gracias', 'genial', 'perfecto', 'hola', 'buenos días', 'qué tal',
      'estoy', 'me siento', 'creo', 'quiero', 'necesito', 'ayuda',
      'estresado', 'cansado', 'frustrado', 'feliz', 'contento',
      'mi familia', 'mi esposa', 'mi esposo', 'mis hijos',
    ]
    const commercialKeywords = [
      'precio', 'cuánto cuesta', 'costo', 'plan', 'paquete', 'producto',
      'servicio', 'agendar', 'cita', 'demo', 'comprar', 'contratar',
      'leads', 'ventas', 'negocio', 'automatización', 'bot', 'crm',
      'inversión', 'roi', 'resultado', 'cliente',
    ]

    const emotionalScore = emotionalKeywords.filter(kw => normalized.includes(kw)).length
    const commercialScore = commercialKeywords.filter(kw => normalized.includes(kw)).length

    // Check history depth for context
    const userMessages = context.conversationHistory.filter(m => m.role === 'user' || m.role === 'contact')
    const isEarlyConversation = userMessages.length <= 2

    if (commercialScore > emotionalScore) {
      return {
        intent: 'commercial',
        confidence: 0.6,
        reasoning: 'Heuristic: commercial keywords detected',
        emotionalSignals: [],
        commercialSignals: commercialKeywords.filter(kw => normalized.includes(kw)),
      }
    }

    if (emotionalScore > commercialScore || isEarlyConversation) {
      return {
        intent: 'emotional',
        confidence: isEarlyConversation ? 0.7 : 0.6,
        reasoning: isEarlyConversation
          ? 'Heuristic: early conversation, defaulting to emotional/rapport-building'
          : 'Heuristic: emotional keywords detected',
        emotionalSignals: emotionalKeywords.filter(kw => normalized.includes(kw)),
        commercialSignals: [],
      }
    }

    // Equal scores → check if profile context suggests commercial
    if (context.profileContext && context.profileContext.includes('Arquetipo:')) {
      return {
        intent: 'commercial',
        confidence: 0.5,
        reasoning: 'Heuristic: profile context suggests known contact, defaulting to commercial',
        emotionalSignals: [],
        commercialSignals: [],
      }
    }

    return {
      intent: 'emotional',
      confidence: 0.5,
      reasoning: 'Heuristic: no strong signal, defaulting to emotional',
      emotionalSignals: [],
      commercialSignals: [],
    }
  }

  /**
   * Build a forced classification for override mode.
   */
  private buildForcedClassification(mode: ActiveMode): ClassificationResult {
    const intentMap: Record<ActiveMode, OrchestratorIntent> = {
      valiautoflow: 'commercial',
      nexus: 'emotional',
      blended: 'mixed',
    }
    return {
      intent: intentMap[mode],
      confidence: 1.0,
      reasoning: `Mode forced to ${mode}`,
      emotionalSignals: mode === 'nexus' || mode === 'blended' ? ['forced'] : [],
      commercialSignals: mode === 'valiautoflow' || mode === 'blended' ? ['forced'] : [],
    }
  }

  /**
   * Count messages in the current conversation stage context.
   */
  private countMessagesInCurrentStage(history: Array<{ role: string; content: string }>): number {
    const userMessages = history.filter(m => m.role === 'user' || m.role === 'contact')
    return userMessages.length
  }

  /**
   * Emit an event to the event bus and collect it locally.
   */
  private emitEvent(type: string, data: Record<string, unknown>): void {
    orchestratorEventBus.emit(type, data)
    this.events.push({
      type,
      timestamp: new Date(),
      data,
    })
  }

  /**
   * Extract and persist memories from the conversation (non-blocking).
   * Uses AI to extract notable facts about the contact.
   */
  private async extractAndPersistMemories(
    input: OrchestratorInput,
    _output: OrchestratorOutput,
    contactId: string
  ): Promise<void> {
    if (!input.contactId || contactId === 'anonymous') return

    try {
      const extractMessages: AIMessage[] = [
        {
          role: 'system',
          content: `Extrae hechos importantes del contacto del siguiente diálogo.
Responde SOLO en formato JSON array, cada objeto con:
- key (breve identificador)
- value (el hecho)
- category (preference/fact/instruction/context)
- importance (1-10)
Si no hay información notable, responde con [].
Ejemplo: [{"key":"nombre","value":"Carlos","category":"fact","importance":8}]
NO incluyas texto adicional, solo el JSON array.`,
        },
        {
          role: 'user',
          content: `Contacto: ${input.message}\nAsistente: ${_output.response}`,
        },
      ]

      const { data } = await chatWithAIJson<Array<{ key: string; value: string; category: string; importance: number }>>(
        extractMessages,
        this.provider,
        undefined,
        { temperature: 0.1, maxTokens: 300, frequencyPenalty: 0, presencePenalty: 0 }
      )

      if (Array.isArray(data) && data.length > 0) {
        for (const mem of data) {
          if (!mem.key || !mem.value) continue
          await db.nexusMemory.upsert({
            where: { userId_key: { userId: contactId, key: mem.key } },
            create: {
              userId: contactId,
              key: mem.key,
              value: mem.value,
              category: mem.category || 'general',
              importance: Math.min(10, Math.max(1, mem.importance || 5)),
              source: 'orchestrator',
            },
            update: {
              value: mem.value,
              importance: Math.min(10, Math.max(1, mem.importance || 5)),
              lastAccessed: new Date(),
              accessCount: { increment: 1 },
            },
          })
        }
        debug(`[Orchestrator] Persisted ${data.length} memories for ${contactId}`)
      }
    } catch {
      // Memory extraction is non-critical
      debug('[Orchestrator] Memory extraction failed (non-critical)')
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════

export const orchestrator = new DualAgentOrchestrator('glm')

// ═══════════════════════════════════════════════════════════════
// UTILITY: Get orchestrator stats for monitoring
// ═══════════════════════════════════════════════════════════════

export function getOrchestratorStats(): {
  activeConversations: number
  modeDistribution: Record<string, number>
} {
  const modeDistribution: Record<string, number> = { valiautoflow: 0, nexus: 0, blended: 0 }
  for (const history of modeHistory.values()) {
    for (const [mode, count] of Object.entries(history.modeCounts)) {
      modeDistribution[mode] = (modeDistribution[mode] || 0) + count
    }
  }
  return {
    activeConversations: modeHistory.size,
    modeDistribution,
  }
}
