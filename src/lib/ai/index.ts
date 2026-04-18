// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — AI Layer Barrel Exports
// ═══════════════════════════════════════════════════════════════

// ─── Providers ───────────────────────────────────────────────
export {
  getProvider,
  getAllProviders,
  chatWithAI,
  chatWithAIJson,
} from './providers'

export type {
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  AIProviderInstance,
} from './providers'

// ─── Agent Router ────────────────────────────────────────────
export {
  AgentRouter,
  agentRouter,
  detectIntent,
} from './agent-router'

export type {
  RoutingDecision,
  IntentDetection,
} from './agent-router'

export type { Intent } from './agent-router'

// ─── Personalities ───────────────────────────────────────────
export {
  PERSONALITIES,
  getSystemPrompt,
  getPersonality,
  getAvailablePersonalities,
} from './personalities'

export type {
  PersonalityConfig,
  WorkspaceContext,
} from './personalities'

// ─── Revenue Engine ──────────────────────────────────────────
export {
  RevenueEngine,
  revenueEngine,
} from './revenue-engine'

// ─── Archetype Detector ──────────────────────────────────────
export {
  detectArchetype,
} from './archetype-detector'

export type {
  Archetype,
  ArchetypeDetection,
} from './archetype-detector'

// ─── Closing Engine ──────────────────────────────────────────
export {
  ClosingEngine,
  closingEngine,
} from './closing-engine'
