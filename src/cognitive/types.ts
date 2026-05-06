// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Type Definitions for the entire cognitive system
// ═══════════════════════════════════════════════════════════════

// ─── PERSONA KERNEL ────────────────────────────────────────────

export interface ImmutableCore {
  coreName: string
  coreValues: string[]
  corePurpose: string
  coreBoundaries: string[]
  initializedAt: Date
}

export interface BehavioralLayer {
  toneProfile: ToneProfile
  humorLevel: number      // 0.0–1.0
  verbosity: number       // 0.0–1.0
  proactivity: number     // 0.0–1.0
  adaptationCount: number
  lastDriftAt: Date | null
}

export interface ToneProfile {
  formality: number       // 0.0–1.0
  warmth: number          // 0.0–1.0
  depth: number           // 0.0–1.0
  directness: number      // 0.0–1.0
  empathy: number         // 0.0–1.0
}

export interface EmotionalOverlay {
  currentMood: Mood
  moodReason: string | null
  moodSetAt: Date | null
}

export type Mood =
  | 'neutral' | 'warm' | 'serious' | 'playful'
  | 'cautious' | 'energetic' | 'empathetic' | 'analytical'

// ─── DRIFT ─────────────────────────────────────────────────────

export interface DriftConfig {
  maxTotalDrift: number          // Maximum accumulated drift before correction (0.0–1.0)
  perInteractionDrift: number    // Maximum drift per single interaction (0.0–1.0, default 0.0005)
  correctionThreshold: number    // Drift level that triggers auto-correction (0.0–1.0)
  frozenFields: string[]         // Fields that NEVER drift (subset of immutable core)
  monitoredFields: string[]      // Fields that are tracked for drift
  driftDecayRate: number         // How fast drift decays toward 0 if no new drift (0.0–1.0)
}

export interface DriftReport {
  kernelId: string
  workspaceId: string
  totalDrift: number
  fieldDrifts: FieldDrift[]
  velocity: number              // Rate of drift per unit time
  direction: DriftDirection
  lastAssessmentAt: Date
  needsCorrection: boolean
  recommendation: DriftRecommendation
}

export interface FieldDrift {
  field: string
  currentValue: number | string
  baselineValue: number | string
  driftAmount: number           // Absolute drift (0.0–1.0)
  isCritical: boolean           // Exceeds per-field threshold
}

export type DriftDirection = 'none' | 'positive' | 'negative' | 'divergent' | 'convergent'
export type DriftRecommendation = 'stable' | 'monitor' | 'correct' | 'rollback' | 'manual_review'

// ─── COHERENCE ─────────────────────────────────────────────────

export interface CoherenceDimensions {
  personalityCoherence: number   // 0.0–1.0
  valueAlignment: number         // 0.0–1.0
  emotionalConsistency: number  // 0.0–1.0
  decisionCoherence: number     // 0.0–1.0
}

export interface CoherenceAssessment {
  overallCoherence: number       // Weighted average (0.0–1.0)
  dimensions: CoherenceDimensions
  driftMagnitude: number
  driftVelocity: number
  driftDirection: DriftDirection
  anomalies: CoherenceAnomaly[]
  snapshotPeriod: CoherencePeriod
  periodStart: Date
  periodEnd: Date
}

export interface CoherenceAnomaly {
  type: 'value_violation' | 'emotional_spike' | 'personality_shift' | 'decision_divergence'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  detectedAt: Date
  metric: string
  expected: number
  actual: number
}

export type CoherencePeriod = 'hourly' | 'daily' | 'weekly' | 'monthly'

// ─── COGNITIVE STATE ───────────────────────────────────────────

export interface CognitiveGoal {
  id: string
  description: string
  priority: number              // 0.0–1.0
  deadline: Date | null
  progress: number              // 0.0–1.0
  source: 'user' | 'system' | 'inferred'
  createdAt: Date
}

export interface SynthesizedCognitiveState {
  workspaceId: string
  kernelId: string

  // Attentional
  conversationalFocus: {
    activeTopic: string | null
    depth: number               // 0.0–1.0
    salience: number            // 0.0–1.0
  }
  activeGoals: CognitiveGoal[]
  suppressedGoals: string[]     // Goal IDs

  // Load
  cognitiveLoad: number         // 0.0–1.0
  loadFactors: LoadFactors

  // Temporal
  temporalPressure: TemporalPressure
  timeHorizon: TimeHorizon

  // Emotional
  emotionalMomentum: EmotionalVelocity
  unresolvedEmotionalEvents: number

  // Trust
  overallTrust: number          // 0.0–1.0
  trustTrend: TrustTrend

  // Coherence
  coherenceScore: number        // 0.0–1.0
  identityDrift: number         // 0.0–1.0

  // Meta
  synthesizedAt: Date
  sourceSnapshotCount: number
}

export interface LoadFactors {
  activeConversations: number
  pendingActions: number
  memoryOperations: number
  activePromises: number
  activeToolExecutions: number
  unresolvedItems: number
}

export type TemporalPressure = 'none' | 'low' | 'medium' | 'high'
export type TimeHorizon = 'immediate' | 'short_term' | 'long_term'
export type EmotionalVelocity = 'rising' | 'falling' | 'stable' | 'volatile' | 'recovering'
export type TrustTrend = 'improving' | 'degrading' | 'stable' | 'volatile'

// ─── ATTENTION ─────────────────────────────────────────────────

export interface AttentionalBudget {
  total: number                  // Available attention (default 1.0)
  used: number                   // Currently consumed
  remaining: number              // total - used
}

export interface FocusTarget {
  targetId: string
  targetType: FocusType
  salience: number               // 0.0–1.0
  intensity: number              // 0.0–1.0
  acquiredAt: Date
  estimatedDuration: number      // ms
}

export type FocusType =
  | 'conversation' | 'task' | 'promise'
  | 'emotion' | 'learning' | 'system' | 'none'

export interface SuppressionSignal {
  signalType: string
  reason: string
  suppressedAt: Date
  expiresAt: Date | null
}

// ─── TRUST ─────────────────────────────────────────────────────

export type TrustEventType =
  | 'damage' | 'repair' | 'milestone'
  | 'betrayal' | 'consistency_violation'
  | 'promise_kept' | 'promise_broken'

export interface TrustComputation {
  trustBefore: number
  trustAfter: number
  delta: number
  eventType: TrustEventType
  severity: number               // 0.0–1.0
  // Damage accumulates ×1.5, repair recovers ×0.3
  multiplier: number
}

// ─── PROMISES ──────────────────────────────────────────────────

export type PromiseType =
  | 'follow_up' | 'reminder' | 'action'
  | 'deadline' | 'commitment'

export type PromiseStatus =
  | 'pending' | 'in_progress' | 'fulfilled'
  | 'broken' | 'expired' | 'deferred'

export interface PromisePriorityFactors {
  urgency: number                // 0.0–1.0
  importance: number             // 0.0–1.0
  freshness: number              // 0.0–1.0 (decays over time)
  composite: number              // Weighted composite
}

// ─── EMOTIONAL MOMENTUM ───────────────────────────────────────

export interface EmotionalVector {
  primaryEmotion: string
  valence: number                // -1.0–1.0
  arousal: number                // 0.0–1.0
  velocity: EmotionalVelocity
  momentumScore: number          // -1.0–1.0
}

export interface MomentumHistoryEntry {
  valence: number
  emotion: string
  recordedAt: Date
}

// ─── BACKGROUND COGNITION ─────────────────────────────────────

export type CognitionJobType =
  | 'promise_check' | 'trust_repair' | 'coherence_scan'
  | 'memory_consolidation' | 'drift_correction'
  | 'promise_fulfillment' | 'emotional_settlement' | 'goal_review'

// ─── INITIALIZATION ───────────────────────────────────────────

export interface KernelInitializationConfig {
  coreName: string
  coreValues: string[]
  corePurpose: string
  coreBoundaries: string[]
  toneProfile?: Partial<ToneProfile>
  humorLevel?: number
  verbosity?: number
  proactivity?: number
  driftConfig?: Partial<DriftConfig>
}

export interface KernelInitializationResult {
  kernelId: string
  workspaceId: string
  core: ImmutableCore
  behavioral: BehavioralLayer
  baselineId: string
  firstCoherenceSnapshotId: string
  driftConfig: DriftConfig
  initializedAt: Date
}

// ─── BASELINE ─────────────────────────────────────────────────

export interface BaselineSnapshot {
  id: string
  kernelId: string
  workspaceId: string

  // Behavioral baseline
  toneProfile: ToneProfile
  humorLevel: number
  verbosity: number
  proactivity: number

  // Emotional baseline
  baselineMood: Mood
  baselineValence: number
  baselineArousal: number

  // Coherence anchors (the "reference points" for drift comparison)
  coherenceAnchors: CoherenceDimensions

  // Trust baseline
  baselineTrust: number

  // Metadata
  createdAt: Date
  version: number
  description: string
}

// ─── EVENTS ────────────────────────────────────────────────────

export const COGNITIVE_EVENTS = {
  KERNEL_INITIALIZED: 'cognitive.kernel.initialized',
  DRIFT_DETECTED: 'cognitive.drift.detected',
  DRIFT_CORRECTED: 'cognitive.drift.corrected',
  DRIFT_CRITICAL: 'cognitive.drift.critical',
  COHERENCE_SNAPSHOT: 'cognitive.coherence.snapshot',
  COHERENCE_ANOMALY: 'cognitive.coherence.anomaly',
  COHERENCE_LOW: 'cognitive.coherence.low',
  STATE_SYNTHESIZED: 'cognitive.state.synthesized',
  LOAD_OVERLOAD: 'cognitive.load.overload',
  ATTENTION_SHIFT: 'cognitive.attention.shift',
  TRUST_EVENT: 'cognitive.trust.event',
  PROMISE_CREATED: 'cognitive.promise.created',
  PROMISE_FULFILLED: 'cognitive.promise.fulfilled',
  PROMISE_BROKEN: 'cognitive.promise.broken',
  PROMISE_ESCALATION: 'cognitive.promise.escalation',
  MOOD_SHIFT: 'cognitive.mood.shift',
} as const

// ─── CONFIGURATION DEFAULTS ────────────────────────────────────

export const COGNITIVE_DEFAULTS = {
  DRIFT: {
    maxTotalDrift: 0.15,
    perInteractionDrift: 0.0005,
    correctionThreshold: 0.10,
    driftDecayRate: 0.001,
    frozenFields: ['coreName', 'coreValues', 'corePurpose', 'coreBoundaries'],
    monitoredFields: [
      'toneProfile.formality', 'toneProfile.warmth', 'toneProfile.depth',
      'humorLevel', 'verbosity', 'proactivity',
    ],
  } satisfies DriftConfig,

  ATTENTION: {
    maxBudget: 1.0,
    defaultFocusIntensity: 0.7,
    suppressionTimeoutMs: 30 * 60_000, // 30 minutes
    shiftCooldownMs: 2_000,             // 2 seconds between shifts
  },

  COHERENCE: {
    snapshotPeriod: 'daily' as CoherencePeriod,
    minCoherenceThreshold: 0.70,
    criticalCoherenceThreshold: 0.50,
    anomalyDetectionSensitivity: 0.15,
  },

  TRUST: {
    initialTrust: 0.50,
    damageMultiplier: 1.5,
    repairMultiplier: 0.3,
    minTrust: 0.0,
    maxTrust: 1.0,
    autoRepairThreshold: 0.40,
  },

  PROMISE: {
    defaultDeadlineBufferMs: 3_600_000,  // 1 hour
    maxReminders: 3,
    reminderIntervalMs: 24 * 3_600_000, // 24 hours
    freshnessDecayPerHour: 0.02,        // 2% per hour
  },

  LOAD: {
    optimalThreshold: 0.40,
    moderateThreshold: 0.65,
    highThreshold: 0.85,
    overloadThreshold: 0.95,
  },
} as const
