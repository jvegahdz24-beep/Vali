// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — Agent Runtime
// Public API — The cognitive conversational agent
//
// Usage:
//   import { agentThink } from '@/agent-runtime'
//
//   const result = await agentThink({
//     workspaceId: 'ws_123',
//     message: 'Hola, quiero agendar una cita',
//     contactId: 'c_456',
//   })
//
//   console.log(result.response)  // AI response with emotional modifiers
//   console.log(result.decision)  // What the agent decided to do
//   console.log(result.cognitiveSnapshot)  // Cognitive state at time of response
// ═══════════════════════════════════════════════════════════════

// ─── Core ──────────────────────────────────────────────────
export { AgentRuntime } from './agent-runtime'
export { ResponseGenerator } from './response-generator'

// ─── Types ─────────────────────────────────────────────────
export type {
  AgentMessage,
  ConversationTurn,
  IntentResult,
  CognitiveSnapshot,
  ToolExecutionRecord,
  AgentThinkRequest,
  AgentThinkResponse,
  AgentDecision,
  AgentDecisionType,
  AgentRuntimeConfig,
} from './types'

export {
  AGENT_RUNTIME_DEFAULTS,
  AGENT_RUNTIME_EVENTS,
} from './types'

// ─── Convenience Functions ─────────────────────────────────

import { AgentRuntime } from './agent-runtime'
import type { AgentThinkRequest, AgentThinkResponse } from './types'

/**
 * Think — Process a user message through the full cognitive loop.
 * This is the PRIMARY entry point for agent interaction.
 *
 * Cognitive Loop (7 steps):
 *   1. Receive user message
 *   2. Classify intent (IntentClassifier)
 *   3. Synthesize cognitive state (CognitiveStateManager)
 *   4. Decide: respond-only or execute tool (CognitiveRuntime.gate())
 *   5. Execute tools if approved (ExecutionPipeline)
 *   6. Generate response with emotional modifiers (ResponseGenerator)
 *   7. Update memory + cognitive feedback
 *
 * @example
 * ```ts
 * const result = await agentThink({
 *   workspaceId: 'ws_abc123',
 *   message: 'Quiero información sobre el Sentra 2024',
 *   contactId: 'contact_xyz',
 *   personality: 'JHON',
 * })
 *
 * console.log(result.response)    // "Hola! El Sentra 2024 es excelente..."
 * console.log(result.decision.type) // "respond_only" | "respond_with_tool" | etc.
 * console.log(result.cognitiveSnapshot.cognitiveLoad) // 0.15
 * ```
 */
export async function agentThink(
  request: AgentThinkRequest,
): Promise<AgentThinkResponse> {
  return AgentRuntime.think(request)
}

/**
 * Get the current cognitive status for a workspace.
 * Useful for dashboards and UI indicators.
 */
export async function getAgentCognitiveStatus(
  workspaceId: string,
) {
  return AgentRuntime.getCognitiveStatus(workspaceId)
}
