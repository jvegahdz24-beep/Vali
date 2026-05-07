// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — Agent Runtime
// Agent Runtime — The cognitive conversational agent
//
// This is the FACE of the system. It ties together:
//   FASE 2 (Memory) → context from past interactions
//   FASE 3 (Tool OS) → intent classification, tool execution
//   FASE 4 (Cognitive Engine) → gating, modifiers, coherence
//
// The 7-step cognitive loop:
//   1. Receive user message
//   2. Classify intent (IntentClassifier from FASE 3)
//   3. Synthesize cognitive state (CognitiveRuntime from FASE 4)
//   4. Decide: respond-only or execute tool (CognitiveRuntime.gate())
//   5. Execute tools if approved (ExecutionPipeline from FASE 3)
//   6. Generate response with emotional modifiers (ResponseGenerator)
//   7. Update memory + cognitive feedback
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn, logTimer } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { CognitiveRuntime, type ExecutionModifiers } from '@/cognitive/cognitive-runtime'
import { CognitiveStateManager } from '@/cognitive/cognitive-state'
import { AttentionalBudgetManager } from '@/cognitive/attentional-budget'
import { IntentClassifier } from '@/tool-runtime/intent-classifier'
import { ExecutionPipeline } from '@/tool-runtime/execution-pipeline'
import { ResponseGenerator } from './response-generator'
import type {
  AgentThinkRequest,
  AgentThinkResponse,
  AgentDecision,
  AgentDecisionType,
  AgentMessage,
  CognitiveSnapshot,
  ConversationTurn,
  IntentResult,
  ToolExecutionRecord,
} from './types'
import { AGENT_RUNTIME_DEFAULTS, AGENT_RUNTIME_EVENTS } from './types'

const TAG = 'AGENT_RUNTIME'

// ═══════════════════════════════════════════════════════════════
// AgentRuntime
// ═══════════════════════════════════════════════════════════════

export class AgentRuntime {

  // ─────────────────────────────────────────────────────────
  // 1. THINK — The main cognitive loop
  // This is the SINGLE ENTRY POINT for agent interaction.
  // ─────────────────────────────────────────────────────────

  static async think(request: AgentThinkRequest): Promise<AgentThinkResponse> {
    const timer = logTimer(TAG, 'think')
    const sessionId = request.sessionId ?? `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    logInfo(TAG, 'think_start', {
      workspaceId: request.workspaceId,
      sessionId,
      messageLength: request.message.length,
    })

    let intent: IntentResult | null = null
    let cognitiveSnapshot: CognitiveSnapshot | null = null
    let toolExecutions: ToolExecutionRecord[] = []
    let decision: AgentDecision = {
      type: 'respond_only',
      reason: 'Initializing',
      toolExecuted: false,
    }
    let responseContent = ''
    let tokensUsed = 0

    try {
      // ─── Step 1: Classify Intent ───
      const classification = await IntentClassifier.classify(
        request.workspaceId,
        request.message,
        {
          sessionId,
          contactId: request.contactId,
          agentId: request.agentId,
        },
      )

      // Map IntentClassification to IntentResult
      intent = {
        intentType: classification.intentType,
        description: classification.description,
        confidence: classification.confidence,
        entities: classification.entities,
        urgency: classification.urgency,
        suggestedToolSlug: classification.suggestedToolSlug,
        suggestedToolId: classification.suggestedToolId,
        resolutionStrategy: classification.resolutionStrategy,
        estimatedRiskLevel: classification.estimatedRiskLevel,
      }

      logOk(TAG, 'intent_classified', {
        type: intent.intentType,
        confidence: intent.confidence.toFixed(3),
        urgency: intent.urgency,
        suggestedTool: intent.suggestedToolSlug,
      })

      eventBus.emit(AGENT_RUNTIME_EVENTS.INTENT_CLASSIFIED, {
        workspaceId: request.workspaceId,
        sessionId,
        intentType: intent.intentType,
        confidence: intent.confidence,
      }, 'agent-runtime')

      // ─── Step 2: Synthesize Cognitive State ───
      let cognitiveState
      try {
        cognitiveState = await CognitiveStateManager.synthesize(request.workspaceId)
      } catch {
        // If synthesis fails (e.g., no kernel initialized), create a neutral state
        cognitiveState = {
          workspaceId: request.workspaceId,
          kernelId: '',
          conversationalFocus: { activeTopic: null, depth: 0, salience: 0 },
          activeGoals: [],
          suppressedGoals: [],
          cognitiveLoad: 0.1,
          loadFactors: {
            activeConversations: 0, pendingActions: 0, memoryOperations: 0,
            activePromises: 0, activeToolExecutions: 0, unresolvedItems: 0,
          },
          temporalPressure: 'none',
          timeHorizon: 'immediate',
          emotionalMomentum: 'stable',
          unresolvedEmotionalEvents: 0,
          overallTrust: 0.5,
          trustTrend: 'stable',
          coherenceScore: 1.0,
          identityDrift: 0,
          synthesizedAt: new Date(),
          sourceSnapshotCount: 0,
        }
      }

      // Get attentional budget
      let attentionBudget
      try {
        attentionBudget = await AttentionalBudgetManager.getBudget(request.workspaceId)
      } catch {
        attentionBudget = {
          budget: { total: 1.0, used: 0, remaining: 1.0 },
          focusTargets: [],
        }
      }

      cognitiveSnapshot = {
        cognitiveLoad: cognitiveState.cognitiveLoad,
        coherenceScore: cognitiveState.coherenceScore,
        emotionalState: cognitiveState.emotionalMomentum,
        emotionalMomentum: cognitiveState.emotionalMomentum,
        trustTrend: cognitiveState.trustTrend,
        overallTrust: cognitiveState.overallTrust,
        temporalPressure: cognitiveState.temporalPressure,
        timeHorizon: cognitiveState.timeHorizon,
        attentionBudgetRemaining: attentionBudget.budget.remaining,
        currentFocus: attentionBudget.focusTargets[0]?.targetId ?? null,
      }

      logOk(TAG, 'cognitive_synthesized', {
        load: cognitiveSnapshot.cognitiveLoad.toFixed(3),
        coherence: cognitiveSnapshot.coherenceScore.toFixed(3),
        momentum: cognitiveSnapshot.emotionalMomentum,
      })

      eventBus.emit(AGENT_RUNTIME_EVENTS.COGNITIVE_STATE_SYNTHESIZED, {
        workspaceId: request.workspaceId,
        sessionId,
        cognitiveLoad: cognitiveSnapshot.cognitiveLoad,
        coherenceScore: cognitiveSnapshot.coherenceScore,
      }, 'agent-runtime')

      // ─── Step 3: Decide — Respond only or Execute tool? ───
      const shouldExecuteTool = intent.suggestedToolSlug &&
        intent.confidence >= 0.4 &&
        intent.resolutionStrategy !== 'manual'

      if (shouldExecuteTool && intent.suggestedToolSlug) {
        // Check cognitive gate for tool execution
        const gate = await CognitiveRuntime.gate(request.workspaceId, {
          type: 'tool_execution',
          name: intent.suggestedToolSlug,
          priority: intent.urgency === 'critical' ? 0.9
            : intent.urgency === 'high' ? 0.7
            : 0.5,
          contactId: request.contactId,
        })

        logInfo(TAG, 'tool_gate', {
          tool: intent.suggestedToolSlug,
          decision: gate.decision,
          reason: gate.reason.slice(0, 200),
        })

        eventBus.emit(AGENT_RUNTIME_EVENTS.TOOL_GATE_CHECKED, {
          workspaceId: request.workspaceId,
          sessionId,
          tool: intent.suggestedToolSlug,
          gateDecision: gate.decision,
        }, 'agent-runtime')

        // ─── Step 4: Execute Tool (if approved) ───
        if (gate.decision === 'approved') {
          try {
            const toolResult = await ExecutionPipeline.execute({
              workspaceId: request.workspaceId,
              contractId: intent.suggestedToolSlug,
              contactId: request.contactId,
              sessionId,
              agentId: request.agentId,
              input: {
                rawMessage: request.message,
                intentType: intent.intentType,
                entities: intent.entities,
                ...intent.entities,
              },
              priority: 0.5,
            })

            toolExecutions.push({
              executionId: toolResult.executionId,
              toolName: intent.suggestedToolSlug,
              status: toolResult.status,
              durationMs: toolResult.durationMs,
              gateDecision: gate.decision,
              output: toolResult.output,
              error: toolResult.error,
            })

            decision = {
              type: toolResult.approvalId
                ? 'tool_pending_approval'
                : toolResult.status === 'completed'
                  ? 'respond_with_tool'
                  : toolResult.status === 'pending'
                    ? 'tool_pending_approval'
                    : 'respond_only',
              reason: gate.reason,
              toolExecuted: true,
              toolExecutionId: toolResult.executionId,
              gateDecision: gate.decision,
            }

            logOk(TAG, 'tool_executed', {
              tool: intent.suggestedToolSlug,
              status: toolResult.status,
              durationMs: toolResult.durationMs,
            })

            eventBus.emit(AGENT_RUNTIME_EVENTS.TOOL_EXECUTED, {
              workspaceId: request.workspaceId,
              sessionId,
              executionId: toolResult.executionId,
              tool: intent.suggestedToolSlug,
              status: toolResult.status,
            }, 'agent-runtime')

            // Record tool completion in cognitive engine
            await CognitiveRuntime.record(request.workspaceId, {
              type: 'tool_completed',
              data: {
                toolName: intent.suggestedToolSlug,
                executionId: toolResult.executionId,
                durationMs: toolResult.durationMs,
                success: toolResult.status === 'completed',
              },
            })

            tokensUsed += toolResult.tokensUsed
          } catch (err) {
            logError(TAG, 'tool_execution_error', err, {
              tool: intent.suggestedToolSlug,
            })
            decision = {
              type: 'respond_only',
              reason: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
              toolExecuted: false,
            }
          }
        } else if (gate.decision === 'deferred') {
          decision = {
            type: 'deferred',
            reason: gate.reason,
            toolExecuted: false,
            gateDecision: gate.decision,
          }
        } else {
          decision = {
            type: gate.decision === 'rejected' ? 'rejected_cognitive' : 'respond_only',
            reason: gate.reason,
            toolExecuted: false,
            gateDecision: gate.decision,
          }
        }
      } else {
        decision = {
          type: 'respond_only',
          reason: intent.suggestedToolSlug
            ? `Insufficient confidence (${intent.confidence.toFixed(3)}) for tool execution`
            : 'No tool suggestion from intent classifier',
          toolExecuted: false,
        }
      }

      // ─── Step 5: Generate Response ───
      const conversationHistory = request.conversationHistory ?? []
      const workspace = await db.workspace.findUnique({
        where: { id: request.workspaceId },
        select: { name: true, industry: true },
      })

      const contact = request.contactId
        ? await db.contact.findUnique({
            where: { id: request.contactId },
            select: { firstName: true, lastName: true },
          })
        : null

      const contactName = contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
        : undefined

      const responseResult = await ResponseGenerator.generate({
        workspaceId: request.workspaceId,
        personality: request.personality ?? AGENT_RUNTIME_DEFAULTS.defaultPersonality,
        provider: request.provider ?? AGENT_RUNTIME_DEFAULTS.defaultProvider,
        conversationHistory,
        currentMessage: request.message,
        cognitiveSnapshot: cognitiveSnapshot,
        intent,
        toolResults: toolExecutions,
        workspaceContext: workspace ? {
          businessName: workspace.name,
          industry: workspace.industry ?? undefined,
        } : undefined,
        contactName,
        maxTokens: AGENT_RUNTIME_DEFAULTS.maxTokens,
      })

      responseContent = responseResult.content
      tokensUsed += responseResult.tokensUsed

      logOk(TAG, 'response_generated', {
        responseLength: responseContent.length,
        tokensUsed,
        model: responseResult.model,
      })

      eventBus.emit(AGENT_RUNTIME_EVENTS.RESPONSE_GENERATED, {
        workspaceId: request.workspaceId,
        sessionId,
        responseLength: responseContent.length,
      }, 'agent-runtime')

      // ─── Step 6: Record interaction in cognitive engine ───
      await CognitiveRuntime.record(request.workspaceId, {
        type: 'interaction',
        data: {
          sessionId,
          contactId: request.contactId,
          intentType: intent?.intentType,
          toolExecuted: decision.toolExecuted,
        },
      })

    } catch (err) {
      logError(TAG, 'think_error', err, {
        workspaceId: request.workspaceId,
        sessionId,
      })

      responseContent = 'Disculpa, tuve un problema interno. ¿Podrías intentar de nuevo?'
      decision = {
        type: 'fallback',
        reason: `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
        toolExecuted: false,
      }
    }

    // ─── Step 7: Build Turn Record ───
    const turn: ConversationTurn = {
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      turnNumber: 0, // Caller can fill this
      userInput: request.message,
      agentResponse: responseContent,
      intent: intent ?? undefined,
      cognitiveSnapshot: cognitiveSnapshot ?? undefined,
      toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
      durationMs: timer.elapsed(),
      tokensUsed,
      createdAt: new Date(),
    }

    const latencyMs = timer.end('ok', {
      sessionId,
      decision: decision.type,
      responseLength: responseContent.length,
      tokensUsed,
    })

    eventBus.emit(AGENT_RUNTIME_EVENTS.TURN_COMPLETED, {
      workspaceId: request.workspaceId,
      sessionId,
      decision: decision.type,
      responseLength: responseContent.length,
      latencyMs,
    }, 'agent-runtime')

    return {
      response: responseContent,
      turn,
      intent,
      cognitiveSnapshot: cognitiveSnapshot ?? {
        cognitiveLoad: 0,
        coherenceScore: 1.0,
        emotionalState: 'stable',
        emotionalMomentum: 'stable',
        trustTrend: 'stable',
        overallTrust: 0.5,
        temporalPressure: 'none',
        timeHorizon: 'immediate',
        attentionBudgetRemaining: 1.0,
        currentFocus: null,
      },
      toolExecutions,
      decision,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET CONVERSATION HISTORY — Load past messages
  // ─────────────────────────────────────────────────────────

  static async getConversationHistory(
    workspaceId: string,
    conversationId?: string,
    limit: number = 30,
  ): Promise<AgentMessage[]> {
    try {
      if (conversationId) {
        const messages = await db.message.findMany({
          where: {
            conversationId,
          },
          orderBy: { createdAt: 'asc' },
          take: limit,
          select: {
            senderType: true,
            content: true,
            direction: true,
          },
        })

        return messages.map((m) => ({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: m.content ?? '',
        }))
      }

      // If no conversation specified, return empty
      return []
    } catch (err) {
      logError(TAG, 'get_history_error', err, { workspaceId, conversationId })
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. GET COGNITIVE STATUS — Current cognitive state for UI
  // ─────────────────────────────────────────────────────────

  static async getCognitiveStatus(
    workspaceId: string,
  ): Promise<{
    snapshot: CognitiveSnapshot | null
    attentionPlan: {
      canAcceptNewTasks: boolean
      currentFocus: string | null
      recommendation: string
    } | null
  }> {
    try {
      const state = await CognitiveStateManager.synthesize(workspaceId)
      const plan = await CognitiveRuntime.attentionAwarePlan(workspaceId)
      const budget = await AttentionalBudgetManager.getBudget(workspaceId)

      const snapshot: CognitiveSnapshot = {
        cognitiveLoad: state.cognitiveLoad,
        coherenceScore: state.coherenceScore,
        emotionalState: state.emotionalMomentum,
        emotionalMomentum: state.emotionalMomentum,
        trustTrend: state.trustTrend,
        overallTrust: state.overallTrust,
        temporalPressure: state.temporalPressure,
        timeHorizon: state.timeHorizon,
        attentionBudgetRemaining: budget.budget.remaining,
        currentFocus: plan.currentFocus,
      }

      return {
        snapshot,
        attentionPlan: {
          canAcceptNewTasks: plan.canAcceptNewTasks,
          currentFocus: plan.currentFocus,
          recommendation: plan.recommendation,
        },
      }
    } catch {
      return { snapshot: null, attentionPlan: null }
    }
  }
}

export default AgentRuntime
