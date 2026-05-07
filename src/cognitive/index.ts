// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Barrel Export — Complete: Sprint 1 + Sprint 2 + Sprint 3 + Sprint 4
// ═══════════════════════════════════════════════════════════════

// ─── Sprint 1: Persona Kernel + Baseline + Drift + Coherence ───

export { PersonaKernel } from './persona-kernel'
export { BaselineGenerator } from './baseline-generator'
export { DriftTracker } from './drift-tracker'
export { CoherenceSnapshots } from './coherence-snapshots'

// ─── Sprint 2: Cognitive State + Salience + Attention + Load ───

export { CognitiveStateManager } from './cognitive-state'
export { SalienceEngine } from './salience-engine'
export { AttentionalBudgetManager } from './attentional-budget'
export { CognitiveLoadManager } from './cognitive-load'
export type { LoadLevel } from './cognitive-load'

// ─── Sprint 3: Coherence Meter ────────────────────────────────

export { CoherenceMeter } from './coherence-meter'
export type {
  CoherenceHealthReport,
  LongitudinalComparisonReport,
  CoherenceHealthGrade,
} from './coherence-meter'

// ─── Sprint 4: Runtime Integration + Trust Engine ─────────────

export { CognitiveRuntime } from './cognitive-runtime'
export type { GateDecision, GateResult, ExecutionModifiers } from './cognitive-runtime'

export { TrustEngine } from './trust-engine'

// ─── Type Definitions ──────────────────────────────────────────

export type {
  // Persona Kernel
  ImmutableCore,
  BehavioralLayer,
  EmotionalOverlay,
  ToneProfile,
  Mood,
  KernelInitializationConfig,
  KernelInitializationResult,

  // Drift
  DriftConfig,
  DriftReport,
  FieldDrift,
  DriftDirection,
  DriftRecommendation,

  // Coherence
  CoherenceDimensions,
  CoherenceAssessment,
  CoherenceAnomaly,
  CoherencePeriod,
  BaselineSnapshot,

  // Cognitive State
  CognitiveGoal,
  SynthesizedCognitiveState,
  LoadFactors,
  TemporalPressure,
  TimeHorizon,
  EmotionalVelocity,
  TrustTrend,

  // Attention
  AttentionalBudget,
  FocusTarget,
  FocusType,
  SuppressionSignal,

  // Trust
  TrustEventType,
  TrustComputation,

  // Promises
  PromiseType,
  PromiseStatus,
  PromisePriorityFactors,

  // Emotional Momentum
  EmotionalVector,
  MomentumHistoryEntry,

  // Background Cognition
  CognitionJobType,
} from './types'

export { COGNITIVE_EVENTS, COGNITIVE_DEFAULTS } from './types'

// ─── Default Export ────────────────────────────────────────────

import PersonaKernel from './persona-kernel'
import BaselineGenerator from './baseline-generator'
import DriftTracker from './drift-tracker'
import CoherenceSnapshots from './coherence-snapshots'
import CognitiveStateManager from './cognitive-state'
import SalienceEngine from './salience-engine'
import AttentionalBudgetManager from './attentional-budget'
import CognitiveLoadManager from './cognitive-load'
import CoherenceMeter from './coherence-meter'
import CognitiveRuntime from './cognitive-runtime'
import TrustEngine from './trust-engine'

export default {
  // Sprint 1: Identity Foundation
  PersonaKernel,
  BaselineGenerator,
  DriftTracker,
  CoherenceSnapshots,
  // Sprint 2: Cognitive Processing
  CognitiveStateManager,
  SalienceEngine,
  AttentionalBudgetManager,
  CognitiveLoadManager,
  // Sprint 3: Coherence Monitoring
  CoherenceMeter,
  // Sprint 4: Runtime Integration
  CognitiveRuntime,
  TrustEngine,
}
