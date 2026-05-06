// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Barrel Export — Sprint 1: Persona Kernel + Baseline + Drift + Coherence
// ═══════════════════════════════════════════════════════════════

// Core classes
export { PersonaKernel } from './persona-kernel'
export { BaselineGenerator } from './baseline-generator'
export { DriftTracker } from './drift-tracker'
export { CoherenceSnapshots } from './coherence-snapshots'

// Type definitions
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

  // Events & Defaults
} from './types'

export { COGNITIVE_EVENTS, COGNITIVE_DEFAULTS } from './types'

// Default exports
import PersonaKernel from './persona-kernel'
import BaselineGenerator from './baseline-generator'
import DriftTracker from './drift-tracker'
import CoherenceSnapshots from './coherence-snapshots'

export default {
  PersonaKernel,
  BaselineGenerator,
  DriftTracker,
  CoherenceSnapshots,
}
