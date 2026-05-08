// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — Agent Runtime
// Response Generator — Generates AI responses with cognitive modifiers
//
// This module bridges the cognitive engine's emotional/attentional
// state with the AI provider's response generation. It injects
// cognitive context into the system prompt and adjusts generation
// parameters based on the current cognitive state.
// ═══════════════════════════════════════════════════════════════

import { chatWithAI, type AIMessage, type AICompletionResult } from '@/lib/ai/providers'
import { getSystemPrompt, type WorkspaceContext } from '@/lib/ai/personalities'
import { logInfo, logOk, logError, logTimer } from '@/lib/logger'
import type { AgentMessage, CognitiveSnapshot, ToolExecutionRecord, IntentResult } from './types'

const TAG = 'RESPONSE_GENERATOR'

// ─── Response Generation Context ────────────────────────────

export interface ResponseContext {
  workspaceId: string
  personality: string
  provider: string
  conversationHistory: AgentMessage[]
  currentMessage: string
  cognitiveSnapshot: CognitiveSnapshot
  intent: IntentResult | null
  toolResults: ToolExecutionRecord[]
  workspaceContext?: WorkspaceContext
  contactName?: string
  maxTokens: number
}

export interface ResponseGenerationResult {
  content: string
  model: string
  provider: string
  tokensUsed: number
  latencyMs: number
  cognitiveModifiersApplied: {
    temperature: number
    maxTokens: number
    frequencyPenalty: number
    presencePenalty: number
  }
}

// ═══════════════════════════════════════════════════════════════
// ResponseGenerator
// ═══════════════════════════════════════════════════════════════

export class ResponseGenerator {

  // ─────────────────────────────────────────────────────────
  // 1. GENERATE — Main entry point
  // Builds the complete message array and calls the AI provider
  // ─────────────────────────────────────────────────────────

  static async generate(context: ResponseContext): Promise<ResponseGenerationResult> {
    const timer = logTimer(TAG, 'generate_response')
    logInfo(TAG, 'generate_start', {
      workspaceId: context.workspaceId,
      personality: context.personality,
      provider: context.provider,
      historyLength: context.conversationHistory.length,
    })

    try {
      // Step 1: Build system prompt with personality + workspace context
      const baseSystemPrompt = getSystemPrompt(
        context.personality,
        context.workspaceContext,
      )

      // Step 2: Inject cognitive modifiers into system prompt
      const cognitivePrompt = ResponseGenerator.buildCognitivePrompt(
        context.cognitiveSnapshot,
        context.intent,
        context.toolResults,
      )

      const fullSystemPrompt = baseSystemPrompt + '\n\n' + cognitivePrompt

      // Step 3: Build message array (system + history + current)
      const messages: AIMessage[] = [
        { role: 'system', content: fullSystemPrompt },
      ]

      // Add conversation history (limited to last N messages)
      const maxHistory = Math.min(context.conversationHistory.length, 30)
      const recentHistory = context.conversationHistory.slice(-maxHistory)
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }

      // Add tool results context if any tools were executed
      if (context.toolResults.length > 0) {
        const toolSummary = ResponseGenerator.formatToolResults(context.toolResults)
        messages.push({
          role: 'system',
          content: `[CONTEXTO DE HERRAMIENTAS EJECUTADAS]\n${toolSummary}`,
        })
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: context.currentMessage,
      })

      // Step 4: Adjust AI parameters based on cognitive state
      const aiParams = ResponseGenerator.computeAIParams(context.cognitiveSnapshot)

      // Step 5: Call AI provider
      const result = await chatWithAI(
        messages,
        context.provider,
        undefined,
        {
          temperature: aiParams.temperature,
          maxTokens: aiParams.maxTokens,
          frequencyPenalty: aiParams.frequencyPenalty,
          presencePenalty: aiParams.presencePenalty,
        },
      )

      const latencyMs = timer.end('ok', {
        tokensUsed: result.tokensUsed,
        model: result.model,
        provider: result.provider,
      })

      logOk(TAG, 'generate_complete', {
        responseLength: result.content.length,
        tokensUsed: result.tokensUsed,
        latencyMs,
        model: result.model,
      })

      return {
        content: result.content.trim(),
        model: result.model,
        provider: result.provider,
        tokensUsed: result.tokensUsed,
        latencyMs,
        cognitiveModifiersApplied: aiParams,
      }
    } catch (err) {
      const latencyMs = timer.end('error', {})
      logError(TAG, 'generate_error', err, {
        workspaceId: context.workspaceId,
        latencyMs,
      })

      // Fallback: return a generic safe response
      return {
        content: ResponseGenerator.getFallbackResponse(context),
        model: 'fallback',
        provider: context.provider,
        tokensUsed: 0,
        latencyMs,
        cognitiveModifiersApplied: {
          temperature: 0.7,
          maxTokens: context.maxTokens,
          frequencyPenalty: 0.5,
          presencePenalty: 0.3,
        },
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Build cognitive prompt section
  // This tells the AI about its current cognitive state
  // so it can naturally adjust its behavior
  // ─────────────────────────────────────────────────────────

  private static buildCognitivePrompt(
    snapshot: CognitiveSnapshot,
    intent: IntentResult | null,
    toolResults: ToolExecutionRecord[],
  ): string {
    const parts: string[] = []

    parts.push(`DIRECTRICES COGNITIVAS ACTUALES:`)

    // Emotional state guidance
    switch (snapshot.emotionalMomentum) {
      case 'volatile':
        parts.push('- Estado emocional VOLÁTIL. Sé contenedor, empático, evita temas tensos. Prioriza la estabilidad emocional del contacto.')
        break
      case 'falling':
        parts.push('- Estado emocional EN CAÍDA. Muestra empatía genuina. Reconoce el sentimiento antes de continuar. Adapta tu tono a algo más cálido.')
        break
      case 'rising':
        parts.push('- Estado emocional EN ASCENSO. Puedes ser más enérgico y propositivo. Es buen momento para sugerir acciones concretas.')
        break
      case 'recovering':
        parts.push('- Estado emocional EN RECUPERACIÓN. Sé suave pero positivo. Refuerza el progreso sin presionar.')
        break
      default:
        parts.push('- Estado emocional ESTABLE. Comunicación normal y profesional.')
    }

    // Trust guidance
    if (snapshot.trustTrend === 'degrading') {
      parts.push('- La confianza está DISMINUYENDO. Sé transparente, evita promesas grandilocuentes. Cumple lo que dices. Mayor cautela.')
    } else if (snapshot.trustTrend === 'improving') {
      parts.push('- La confianza está MEJORANDO. Puedes ser más cercano y propositivo. Buen momento para profundizar la relación.')
    }

    // Temporal pressure
    if (snapshot.temporalPressure === 'high') {
      parts.push('- Hay PRESIÓN TEMPORAL alta. Ve al grano. Mensajes cortos. Propón acciones inmediatas concretas.')
    }

    // Cognitive load
    if (snapshot.cognitiveLoad > 0.85) {
      parts.push('- Carga cognitiva ELEVADA. Simplifica tu respuesta. Máximo 2-3 frases. Enfócate en lo esencial.')
    } else if (snapshot.cognitiveLoad > 0.65) {
      parts.push('- Carga cognitiva MODERADA. Respuesta concisa pero completa. Evita divagar.')
    }

    // Coherence
    if (snapshot.coherenceScore < 0.7) {
      parts.push('- Coherencia por debajo del óptimo. Mantén consistencia con interacciones previas.')
    }

    // Attention focus
    if (snapshot.currentFocus) {
      parts.push(`- Enfoque actual de atención: ${snapshot.currentFocus}. Mantén la conversación en este tema.`)
    }

    // Intent context
    if (intent && intent.confidence > 0.5) {
      parts.push(`- Intención detectada: ${intent.description} (confianza: ${(intent.confidence * 100).toFixed(0)}%). Urgencia: ${intent.urgency}.`)
    }

    // Tool results
    if (toolResults.length > 0) {
      const successful = toolResults.filter(t => t.status === 'completed').length
      const failed = toolResults.filter(t => t.status === 'failed').length
      parts.push(`- ${successful} herramienta(s) ejecutada(s) exitosamente${failed > 0 ? `, ${failed} falló/fallaron` : ''}. Usa los resultados para construir tu respuesta.`)
    }

    return parts.join('\n')
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Compute AI parameters from cognitive state
  // Adjusts temperature, penalties based on emotional/cognitive context
  // ─────────────────────────────────────────────────────────

  private static computeAIParams(snapshot: CognitiveSnapshot): {
    temperature: number
    maxTokens: number
    frequencyPenalty: number
    presencePenalty: number
  } {
    let temperature = 0.7
    let maxTokens = 2048
    let frequencyPenalty = 0.5
    let presencePenalty = 0.3

    // Emotional momentum → temperature adjustment
    switch (snapshot.emotionalMomentum) {
      case 'volatile':
        temperature = 0.4  // More controlled
        break
      case 'rising':
        temperature = 0.85 // More creative
        break
      case 'recovering':
        temperature = 0.6  // Gentle
        break
    }

    // Trust → creativity vs caution
    if (snapshot.trustTrend === 'degrading') {
      temperature = Math.max(0.3, temperature - 0.2)
      presencePenalty = 0.5 // Less surprising
    } else if (snapshot.trustTrend === 'improving') {
      presencePenalty = 0.6 // More variety
    }

    // Cognitive load → response length
    if (snapshot.cognitiveLoad > 0.85) {
      maxTokens = 300
    } else if (snapshot.cognitiveLoad > 0.65) {
      maxTokens = 800
    }

    // Temporal pressure → brevity
    if (snapshot.temporalPressure === 'high') {
      maxTokens = Math.min(maxTokens, 600)
      temperature = Math.max(0.3, temperature - 0.1)
    }

    // Clamp values
    temperature = Math.max(0.1, Math.min(1.0, temperature))
    maxTokens = Math.max(100, Math.min(4096, maxTokens))
    frequencyPenalty = Math.max(0, Math.min(1, frequencyPenalty))
    presencePenalty = Math.max(0, Math.min(1, presencePenalty))

    return { temperature, maxTokens, frequencyPenalty, presencePenalty }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Format tool results for AI consumption
  // ─────────────────────────────────────────────────────────

  private static formatToolResults(results: ToolExecutionRecord[]): string {
    return results.map((r) => {
      if (r.status === 'completed') {
        const outputStr = typeof r.output === 'string'
          ? r.output
          : JSON.stringify(r.output, null, 2)
        return `[OK] ${r.toolName}: ${outputStr?.slice(0, 500) ?? 'sin output'}`
      }
      return `[ERROR] ${r.toolName}: ${r.error ?? 'Error desconocido'}`
    }).join('\n')
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Fallback response when AI fails
  // ─────────────────────────────────────────────────────────

  private static getFallbackResponse(context: ResponseContext): string {
    if (context.toolResults.length > 0) {
      const successful = context.toolResults.filter(t => t.status === 'completed')
      if (successful.length > 0) {
        return 'Procesé tu solicitud. ¿Necesitas algo más?'
      }
      return 'Tuve un problema al procesar la herramienta. Intenta de nuevo en un momento.'
    }

    return 'Disculpa, tuve un problema técnico. ¿Podrías repetir tu mensaje?'
  }
}

export default ResponseGenerator
