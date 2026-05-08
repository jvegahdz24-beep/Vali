// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — Agent Runtime
// Type definitions for the cognitive conversational agent
// ═══════════════════════════════════════════════════════════════

// ─── Message Types ───────────────────────────────────────────

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
}

export interface ConversationTurn {
  id: string
  sessionId: string
  turnNumber: number
  userInput: string
  agentResponse: string
  intent?: IntentResult
  cognitiveSnapshot?: CognitiveSnapshot
  toolExecutions?: ToolExecutionRecord[]
  durationMs: number
  tokensUsed: number
  createdAt: Date
}

// ─── Intent Result ──────────────────────────────────────────

export interface IntentResult {
  intentType: string
  description: string
  confidence: number
  entities: Record<string, unknown>
  urgency: 'low' | 'medium' | 'high' | 'critical'
  suggestedToolSlug: string | null
  suggestedToolId: string | null
  resolutionStrategy: 'automatic' | 'manual' | 'hybrid'
  estimatedRiskLevel: string
}

// ─── Cognitive Snapshot ─────────────────────────────────────

export interface CognitiveSnapshot {
  cognitiveLoad: number
  coherenceScore: number
  emotionalState: string
  emotionalMomentum: string
  trustTrend: string
  overallTrust: number
  temporalPressure: string
  timeHorizon: string
  attentionBudgetRemaining: number
  currentFocus: string | null
}

// ─── Tool Execution Record ──────────────────────────────────

export interface ToolExecutionRecord {
  executionId: string
  toolName: string
  status: string
  durationMs: number
  gateDecision: string
  output: unknown
  error?: string
}

// ─── Agent Think Request ────────────────────────────────────

export interface AgentThinkRequest {
  workspaceId: string
  sessionId?: string
  contactId?: string
  agentId?: string
  message: string
  conversationHistory?: AgentMessage[]
  personality?: string
  provider?: string
}

// ─── Agent Think Response ───────────────────────────────────

export interface AgentThinkResponse {
  response: string
  turn: ConversationTurn
  intent: IntentResult | null
  cognitiveSnapshot: CognitiveSnapshot
  toolExecutions: ToolExecutionRecord[]
  decision: AgentDecision
}

// ─── Agent Decision ─────────────────────────────────────────

export type AgentDecisionType =
  | 'respond_only'
  | 'respond_with_tool'
  | 'tool_pending_approval'
  | 'deferred'
  | 'rejected_cognitive'
  | 'rejected_coherence'
  | 'fallback'

export interface AgentDecision {
  type: AgentDecisionType
  reason: string
  toolExecuted: boolean
  toolExecutionId?: string
  gateDecision?: string
}

// ─── Agent Runtime Config ───────────────────────────────────

export interface AgentRuntimeConfig {
  defaultPersonality: string
  defaultProvider: string
  maxConversationHistory: number
  maxTokens: number
  includeCognitiveContext: boolean
  includeMemoryContext: boolean
  autoExecuteSafeTools: boolean
  maxToolExecutionsPerTurn: number
}

export const AGENT_RUNTIME_DEFAULTS: AgentRuntimeConfig = {
  defaultPersonality: 'JHON',
  defaultProvider: 'glm',
  maxConversationHistory: 50,
  maxTokens: 2048,
  includeCognitiveContext: true,
  includeMemoryContext: true,
  autoExecuteSafeTools: true,
  maxToolExecutionsPerTurn: 3,
} as const

// ─── Events ─────────────────────────────────────────────────

export const AGENT_RUNTIME_EVENTS = {
  TURN_STARTED: 'agent.turn.started',
  TURN_COMPLETED: 'agent.turn.completed',
  INTENT_CLASSIFIED: 'agent.intent.classified',
  COGNITIVE_STATE_SYNTHESIZED: 'agent.cognitive.synthesized',
  TOOL_GATE_CHECKED: 'agent.tool.gate_checked',
  TOOL_EXECUTED: 'agent.tool.executed',
  RESPONSE_GENERATED: 'agent.response.generated',
  MEMORY_UPDATED: 'agent.memory.updated',
  ERROR: 'agent.error',
} as const
