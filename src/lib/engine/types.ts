// ═══════════════════════════════════════════════════════════════
// JHON ENGINE — Type Definitions
// Events, Memory, Autonomy & Decision Types
// ═══════════════════════════════════════════════════════════════

// ─── Outcome Types ─────────────────────────────
export type ActionOutcome =
  | "REPLIED"
  | "NO_RESPONSE_2H"
  | "NO_RESPONSE_24H"
  | "INTEREST_CONFIRMED"
  | "MEETING_BOOKED"
  | "GHOSTED"
  | "CLOSED_WON"
  | "CLOSED_LOST"

export type ActionType =
  | "SEND_FOLLOW_UP"
  | "SEND_PROPOSAL"
  | "CALL_NOW"
  | "SCHEDULE_MEETING"
  | "SEND_AGGRESSIVE_FOLLOWUP"
  | "REACTIVATE"
  | "UPDATE_SCORE"
  | "MARK_WON"
  | "MARK_LOST"
  | "LOG_NOTE"

export type Urgency = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

export type BehaviorPattern =
  | "neglected_hot_lead"
  | "ready_to_close"
  | "ghost_after_intent"
  | "price_sensitive"
  | "recurring_window_shopper"
  | "cold_no_activity"
  | "warm_need_nudge"
  | "hot_active_buyer"
  | "new_unqualified"

// ─── Decision Trace ─────────────────────────────
export interface DecisionFactor {
  factor: string
  weight: number  // positive = good signal, negative = bad signal
  description: string
}

// ─── Pattern Effectiveness ──────────────────────
export interface PatternEffectiveness {
  pattern: BehaviorPattern
  successRate: number        // 0-1
  avgTimeToClose: number     // hours
  totalOccurrences: number
  lastOutcome?: ActionOutcome
}

// ─── Lead Memory Interpretation ─────────────────
export interface LeadMemory {
  contactId: string
  pattern: BehaviorPattern
  intentLevel: number          // 0-100
  scoreTrend: "rising" | "falling" | "stable"
  confidenceScore: number      // 0-1
  confidenceReason: string
  riskLevel: "critical" | "high" | "medium" | "low"
  timeToDecay: number          // minutes until temperature drops
  decisionTrace: DecisionFactor[]
  patternEffectiveness: PatternEffectiveness | null
  narrative: string            // Spanish business narrative
  nextBestAction: {
    type: ActionType
    label: string
    reason: string
    urgency: Urgency
    jhonSays: string
    expectedOutcome: string
    deadline: number           // minutes
    ifNotMet: ActionType
  }
}

// ─── Global Priority ────────────────────────────
export interface GlobalPriority {
  contactId: string
  contactName: string
  contactPhone: string | null
  action: ActionType
  actionLabel: string
  reason: string
  urgency: Urgency
  timeToDecay: number          // minutes
  jhonSays: string
  confidenceScore: number
  score: number
  temperature: string
}
