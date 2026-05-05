// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0.0 — Memory System
// Barrel exports for the multi-layer memory system
// ═══════════════════════════════════════════════════════════════

// ─── Core Stores ───────────────────────────────────────────
export { SemanticStore } from './semantic-store'
export { EpisodicStore } from './episodic-store'
export { EmotionalStore } from './emotional-store'
export { BehavioralStore } from './behavioral-store'
export { WorkingMemory } from './working-memory'

// ─── Orchestrator ─────────────────────────────────────────
export { MemoryManager } from './memory-manager'

// ─── Query Helpers (re-exports) ───────────────────────────
export {
  getFullContactMemory,
  getQuickContext,
  findSimilarContacts,
  getBuyingSignals,
  getEmotionalAlerts,
  getStaleContacts,
} from './memory-queries'

export type {
  ContactMemoryProfile,
  SimilarContactResult,
  BuyingSignal,
  EmotionalAlert,
  StaleContact,
} from './memory-queries'

// ─── Orchestrator Types (re-exports) ──────────────────────
export type {
  ProcessMessageInput,
  ProcessMessageResult,
  EmotionResult,
  ContactContext,
  ConversationContext,
  EmotionalSnapshot,
  BehavioralSnapshot,
  EpisodeSummary,
  LeadProfileSnapshot,
  MemorySearchOptions,
  MemorySearchResult,
  ContactProfileResult,
} from './memory-manager'
