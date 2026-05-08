// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Coherence Meter — The central coherence monitoring orchestrator
// Combines persona drift, coherence snapshots, longitudinal trends,
// and regression tests into a unified "coherence health" dashboard.
//
// This is the CRITICAL component the user identified as
// "probably the most important component" — it enables:
//   - Longitudinal observability (identity over time)
//   - Personality benchmarking (how stable is the agent?)
//   - Cognitive regression testing (is it getting worse?)
//   - Auto-correction triggers (fix it before it breaks)
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { PersonaKernel } from './persona-kernel'
import { BaselineGenerator } from './baseline-generator'
import { DriftTracker } from './drift-tracker'
import { CoherenceSnapshots } from './coherence-snapshots'
import { CognitiveLoadManager, type LoadLevel } from './cognitive-load'
import { CognitiveStateManager } from './cognitive-state'
import {
  type CoherenceAssessment,
  type CoherenceDimensions,
  type CoherencePeriod,
  type CoherenceAnomaly,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'COHERENCE_METER'

// ─── Coherence Health Grades ────────────────────────────────────

export type CoherenceHealthGrade =
  | 'excellent'    // >= 0.90 — Fully coherent, stable identity
  | 'good'         // >= 0.75 — Minor drift, well within bounds
  | 'acceptable'   // >= 0.60 — Noticeable drift, monitoring recommended
  | 'degraded'     // >= 0.45 — Significant drift, correction recommended
  | 'critical'     // >= 0.30 — Identity fragmentation, auto-correct needed
  | 'broken'       // < 0.30  — Identity lost, manual review required

const HEALTH_GRADE_THRESHOLDS: Array<{ grade: CoherenceHealthGrade; min: number }> = [
  { grade: 'excellent', min: 0.90 },
  { grade: 'good', min: 0.75 },
  { grade: 'acceptable', min: 0.60 },
  { grade: 'degraded', min: 0.45 },
  { grade: 'critical', min: 0.30 },
  { grade: 'broken', min: 0.0 },
]

// ─── Auto-Correction Policies ───────────────────────────────────

type CorrectionAction =
  | 'none'                  // No action needed
  | 'monitor'               // Just keep watching
  | 'soft_correct'          // Apply gentle drift correction (70% revert)
  | 'hard_correct'          // Apply aggressive correction (90% revert)
  | 'baseline_reset'        // Create new baseline at current state
  | 'manual_review'         // Escalate to human oversight
  | 'kernel_reinit'         // Nuclear option: reinitialize kernel

interface CorrectionPolicy {
  action: CorrectionAction
  reason: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  autoExecutable: boolean   // Can this be executed without human approval?
}

// ═══════════════════════════════════════════════════════════════
// CoherenceMeter
// ═══════════════════════════════════════════════════════════════

export class CoherenceMeter {

  // ─────────────────────────────────────────────────────────
  // 1. FULL HEALTH CHECK
  // The main entry point. Runs all coherence checks and returns
  // a comprehensive health report.
  // ─────────────────────────────────────────────────────────

  static async healthCheck(
    workspaceId: string,
    options?: {
      forceNewSnapshot?: boolean // Force a new coherence capture
      period?: CoherencePeriod
    },
  ): Promise<CoherenceHealthReport> {
    const timerStart = Date.now()
    logInfo(TAG, 'health_check_start', { workspaceId })

    try {
      // ── Step 1: Capture or retrieve coherence snapshot ──
      let assessment: CoherenceAssessment | null = null

      if (options?.forceNewSnapshot) {
        const result = await CoherenceSnapshots.capture(
          workspaceId,
          options.period ?? 'daily',
        )
        assessment = result.assessment
      } else {
        assessment = await CoherenceSnapshots.getLatest(workspaceId)
      }

      // ── Step 2: If no assessment exists, take an initial one ──
      if (!assessment) {
        const result = await CoherenceSnapshots.capture(workspaceId, 'daily')
        assessment = result.assessment
      }

      // ── Step 3: Run drift assessment ──
      const driftReport = await DriftTracker.assess(workspaceId)

      // ── Step 4: Run regression test ──
      const regression = await CoherenceSnapshots.regressionTest(workspaceId, 7)

      // ── Step 5: Get trend analysis ──
      const trend = await CoherenceSnapshots.getTrend(workspaceId, 30)

      // ── Step 6: Get anomaly history ──
      const anomalies = await CoherenceSnapshots.getAnomalyHistory(
        workspaceId,
        { minSeverity: 'medium', limit: 10 },
      )

      // ── Step 7: Get drift history for velocity analysis ──
      const driftHistory = await DriftTracker.getDriftHistory(workspaceId, 30)

      // ── Step 8: Determine health grade ──
      const healthGrade = CoherenceMeter.classifyHealth(assessment.overallCoherence)

      // ── Step 9: Determine correction policy ──
      const correctionPolicy = CoherenceMeter.determineCorrectionPolicy(
        assessment,
        driftReport,
        regression,
        healthGrade,
      )

      // ── Step 10: Get dimension analysis ──
      const dimensionAnalysis = CoherenceMeter.analyzeDimensions(assessment.dimensions)

      const latencyMs = Date.now() - timerStart

      logOk(TAG, 'health_check_complete', {
        workspaceId,
        healthGrade,
        coherence: assessment.overallCoherence.toFixed(3),
        drift: driftReport.totalDrift.toFixed(4),
        hasRegression: regression.hasRegression,
        anomalyCount: anomalies.length,
        correctionAction: correctionPolicy.action,
        latencyMs,
      })

      return {
        workspaceId,
        timestamp: new Date(),

        // Core metrics
        overallCoherence: assessment.overallCoherence,
        healthGrade,
        driftMagnitude: driftReport.totalDrift,
        driftVelocity: driftReport.velocity,
        driftDirection: driftReport.direction,

        // Dimensions
        dimensions: assessment.dimensions,
        dimensionAnalysis,

        // Regression
        hasRegression: regression.hasRegression,
        regressionSeverity: regression.regressionSeverity,
        regressionDelta: regression.delta,
        failingDimensions: regression.failingDimensions,

        // Trend
        trendDirection: trend.overall,
        trendSlope: trend.slope,
        trendR2: trend.r2,
        dataPointCount: trend.dataPoints.length,

        // Anomalies
        recentAnomalies: anomalies,
        criticalAnomalyCount: anomalies.filter((a) => a.severity === 'high' || a.severity === 'critical').length,

        // Correction
        correctionPolicy,

        // Recommendations
        recommendations: CoherenceMeter.generateRecommendations(
          healthGrade,
          driftReport,
          regression,
          anomalies,
          { overall: trend.overall, slope: trend.slope, dataPointCount: trend.dataPoints.length },
        ),

        latencyMs,
      }
    } catch (err) {
      logError(TAG, 'health_check_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. AUTO-CORRECT
  // Executes the recommended correction based on current state.
  // Only executes if the policy allows auto-execution.
  // ─────────────────────────────────────────────────────────

  static async autoCorrect(
    workspaceId: string,
    options?: {
      force?: boolean              // Override autoExecutable check
      correctionStrength?: number  // 0.0–1.0, how much to revert (default: 0.7)
    },
  ): Promise<{
    corrected: boolean
    action: CorrectionAction
    driftBefore: number
    driftAfter: number
    message: string
  }> {
    logInfo(TAG, 'auto_correct_start', { workspaceId, force: options?.force })

    try {
      // ── Get health report to determine what action to take ──
      const health = await CoherenceMeter.healthCheck(workspaceId)
      const { correctionPolicy } = health

      // ── Check if we should execute ──
      if (!correctionPolicy.autoExecutable && !options?.force) {
        return {
          corrected: false,
          action: correctionPolicy.action,
          driftBefore: health.driftMagnitude,
          driftAfter: health.driftMagnitude,
          message: `Action '${correctionPolicy.action}' requires manual approval. Reason: ${correctionPolicy.reason}`,
        }
      }

      // ── Execute based on action type ──
      switch (correctionPolicy.action) {
        case 'none':
        case 'monitor':
          return {
            corrected: false,
            action: correctionPolicy.action,
            driftBefore: health.driftMagnitude,
            driftAfter: health.driftMagnitude,
            message: correctionPolicy.reason,
          }

        case 'soft_correct': {
          const strength = options?.correctionStrength ?? 0.7
          const result = await CoherenceMeter.executeDriftCorrection(
            workspaceId,
            strength,
            'auto_soft_correction',
          )
          return {
            corrected: result.corrected,
            action: 'soft_correct',
            driftBefore: result.driftBefore,
            driftAfter: result.driftAfter,
            message: result.corrected
              ? `Soft correction applied (${(strength * 100).toFixed(0)}% revert). Drift: ${result.driftBefore.toFixed(4)} → ${result.driftAfter.toFixed(4)}`
              : 'Soft correction not needed.',
          }
        }

        case 'hard_correct': {
          const strength = options?.correctionStrength ?? 0.9
          const result = await CoherenceMeter.executeDriftCorrection(
            workspaceId,
            strength,
            'auto_hard_correction',
          )
          return {
            corrected: result.corrected,
            action: 'hard_correct',
            driftBefore: result.driftBefore,
            driftAfter: result.driftAfter,
            message: result.corrected
              ? `Hard correction applied (${(strength * 100).toFixed(0)}% revert). Drift: ${result.driftBefore.toFixed(4)} → ${result.driftAfter.toFixed(4)}`
              : 'Hard correction failed.',
          }
        }

        case 'baseline_reset': {
          const kernel = await PersonaKernel.get(workspaceId)
          if (!kernel) {
            return {
              corrected: false,
              action: 'baseline_reset',
              driftBefore: health.driftMagnitude,
              driftAfter: health.driftMagnitude,
              message: 'Cannot reset baseline: no kernel found.',
            }
          }

          await BaselineGenerator.createPeriodicBaseline(
            kernel.kernelId,
            workspaceId,
            kernel.behavioral,
            'auto_baseline_reset_after_drift_stabilization',
          )

          return {
            corrected: true,
            action: 'baseline_reset',
            driftBefore: health.driftMagnitude,
            driftAfter: 0, // Reset to 0 since we have a new baseline
            message: 'New baseline created at current behavioral state. Drift counter reset.',
          }
        }

        case 'manual_review':
          return {
            corrected: false,
            action: 'manual_review',
            driftBefore: health.driftMagnitude,
            driftAfter: health.driftMagnitude,
            message: `MANUAL REVIEW REQUIRED. Coherence is critically low (${health.overallCoherence.toFixed(3)}). Human intervention needed. Failing dimensions: ${health.failingDimensions.join(', ') || 'all'}.`,
          }

        case 'kernel_reinit':
          return {
            corrected: false,
            action: 'kernel_reinit',
            driftBefore: health.driftMagnitude,
            driftAfter: health.driftMagnitude,
            message: 'KERNEL REINITIALIZATION recommended. This is a destructive operation that requires manual confirmation. Identity coherence is broken.',
          }

        default:
          return {
            corrected: false,
            action: correctionPolicy.action,
            driftBefore: health.driftMagnitude,
            driftAfter: health.driftMagnitude,
            message: `Unknown correction action: ${correctionPolicy.action}`,
          }
      }
    } catch (err) {
      logError(TAG, 'auto_correct_error', err, { workspaceId })
      return {
        corrected: false,
        action: 'none',
        driftBefore: 0,
        driftAfter: 0,
        message: err instanceof Error ? err.message : 'Unknown error during auto-correction',
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. LONGITUDINAL COMPARISON
  // Compare coherence between two arbitrary time periods.
  // Answers: "How has the agent changed between March and June?"
  // ─────────────────────────────────────────────────────────

  static async longitudinalCompare(
    workspaceId: string,
    periodA: { start: Date; end: Date },
    periodB: { start: Date; end: Date },
    periodLabelA?: string,
    periodLabelB?: string,
  ): Promise<LongitudinalComparisonReport> {
    logInfo(TAG, 'longitudinal_compare_start', {
      workspaceId,
      periodALabel: periodLabelA,
      periodBLabel: periodLabelB,
    })

    try {
      // ── Get snapshots for both periods ──
      const [snapshotA, snapshotB] = await Promise.all([
        db.coherenceSnapshot.findFirst({
          where: {
            workspaceId,
            periodStart: { gte: periodA.start, lte: periodA.end },
          },
          orderBy: { createdAt: 'desc' },
        }),
        db.coherenceSnapshot.findFirst({
          where: {
            workspaceId,
            periodStart: { gte: periodB.start, lte: periodB.end },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      if (!snapshotA && !snapshotB) {
        return {
          workspaceId,
          periodALabel: periodLabelA ?? 'Period A',
          periodBLabel: periodLabelB ?? 'Period B',
          hasData: false,
          coherenceA: null,
          coherenceB: null,
          delta: 0,
          healthGradeA: null,
          healthGradeB: null,
          dimensionDeltas: {
            personalityCoherence: 0,
            valueAlignment: 0,
            emotionalConsistency: 0,
            decisionCoherence: 0,
          },
          verdict: 'No data available for either period.',
        }
      }

      const coherenceA = snapshotA?.overallCoherence ?? 1.0
      const coherenceB = snapshotB?.overallCoherence ?? 1.0
      const delta = coherenceB - coherenceA

      const healthGradeA = snapshotA
        ? CoherenceMeter.classifyHealth(coherenceA)
        : null
      const healthGradeB = snapshotB
        ? CoherenceMeter.classifyHealth(coherenceB)
        : null

      // Dimension deltas
      const dimensionDeltas = {
        personalityCoherence: (snapshotB?.personalityCoherence ?? 1.0) - (snapshotA?.personalityCoherence ?? 1.0),
        valueAlignment: (snapshotB?.valueAlignment ?? 1.0) - (snapshotA?.valueAlignment ?? 1.0),
        emotionalConsistency: (snapshotB?.emotionalConsistency ?? 1.0) - (snapshotA?.emotionalConsistency ?? 1.0),
        decisionCoherence: (snapshotB?.decisionCoherence ?? 1.0) - (snapshotA?.decisionCoherence ?? 1.0),
      }

      // Verdict
      let verdict: string
      if (Math.abs(delta) < 0.03) {
        verdict = `Identity stable across periods. Coherence changed by ${delta.toFixed(3)} (negligible). The agent is maintaining its personality consistently.`
      } else if (delta > 0.03) {
        verdict = `Identity improved. Coherence increased by ${delta.toFixed(3)}. Strongest improvement in: ${CoherenceMeter.getStrongestDimension(dimensionDeltas)}. The agent is becoming more coherent.`
      } else if (delta > -0.10) {
        verdict = `Mild identity drift detected. Coherence decreased by ${Math.abs(delta).toFixed(3)}. Most affected: ${CoherenceMeter.getWeakestDimension(dimensionDeltas)}. Consider monitoring.`
      } else if (delta > -0.20) {
        verdict = `Significant identity drift. Coherence decreased by ${Math.abs(delta).toFixed(3)}. Most affected: ${CoherenceMeter.getWeakestDimension(dimensionDeltas)}. Drift correction recommended.`
      } else {
        verdict = `SEVERE identity degradation. Coherence decreased by ${Math.abs(delta).toFixed(3)}. Multiple dimensions failing: ${Object.entries(dimensionDeltas).filter(([, d]) => d < -0.10).map(([k]) => k).join(', ')}. Immediate action required.`
      }

      return {
        workspaceId,
        periodALabel: periodLabelA ?? `${periodA.start.toISOString().slice(0, 10)} → ${periodA.end.toISOString().slice(0, 10)}`,
        periodBLabel: periodLabelB ?? `${periodB.start.toISOString().slice(0, 10)} → ${periodB.end.toISOString().slice(0, 10)}`,
        hasData: true,
        coherenceA,
        coherenceB,
        delta,
        healthGradeA,
        healthGradeB,
        dimensionDeltas,
        verdict,
      }
    } catch (err) {
      logError(TAG, 'longitudinal_compare_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. PERSONALITY BENCHMARK
  // Compares current persona against the original baseline to
  // answer: "How much has this agent changed since creation?"
  // ─────────────────────────────────────────────────────────

  static async personalityBenchmark(
    workspaceId: string,
  ): Promise<{
    currentCoherence: number
    totalDriftFromOriginal: number
    strongestDimension: string
    weakestDimension: string
    adaptationsSinceCreation: number
    verdict: string
    detailedMetrics: {
      formality: { baseline: number; current: number; drift: number }
      warmth: { baseline: number; current: number; drift: number }
      depth: { baseline: number; current: number; drift: number }
      directness: { baseline: number; current: number; drift: number }
      empathy: { baseline: number; current: number; drift: number }
      humorLevel: { baseline: number; current: number; drift: number }
      verbosity: { baseline: number; current: number; drift: number }
      proactivity: { baseline: number; current: number; drift: number }
    }
  }> {
    try {
      const kernel = await PersonaKernel.get(workspaceId)
      if (!kernel) {
        throw new Error(`No Persona Kernel for workspace ${workspaceId}`)
      }

      const baseline = await BaselineGenerator.getLatestBaseline(kernel.kernelId)
      if (!baseline) {
        throw new Error('No baseline found for comparison')
      }

      const { behavioral } = kernel

      // Compute per-field drift
      const toneFields = ['formality', 'warmth', 'depth', 'directness', 'empathy'] as const
      const scalarFields = ['humorLevel', 'verbosity', 'proactivity'] as const

      const detailedMetrics: Record<string, { baseline: number; current: number; drift: number }> = {}

      let strongestDim = ''
      let weakestDim = ''
      let minDrift = Infinity
      let maxDrift = -Infinity

      for (const field of toneFields) {
        const baselineVal = baseline.toneProfile[field]
        const currentVal = behavioral.toneProfile[field]
        const drift = currentVal - baselineVal
        const absDrift = Math.abs(drift)

        detailedMetrics[field] = {
          baseline: baselineVal,
          current: currentVal,
          drift: Math.round(drift * 1000) / 1000,
        }

        if (absDrift > maxDrift) { maxDrift = absDrift; weakestDim = field }
        if (absDrift < minDrift) { minDrift = absDrift; strongestDim = field }
      }

      for (const field of scalarFields) {
        const baselineVal = baseline[field]
        const currentVal = behavioral[field]
        const drift = currentVal - baselineVal
        const absDrift = Math.abs(drift)

        detailedMetrics[field] = {
          baseline: baselineVal,
          current: currentVal,
          drift: Math.round(drift * 1000) / 1000,
        }

        if (absDrift > maxDrift) { maxDrift = absDrift; weakestDim = field }
        if (absDrift < minDrift) { minDrift = absDrift; strongestDim = field }
      }

      const totalDriftFromOriginal = BaselineGenerator.computeTotalDrift(behavioral, baseline)
      const coherenceAnchors = BaselineGenerator.computeCoherenceAnchors(behavioral, baseline)
      const currentCoherence = CoherenceSnapshots.computeOverallCoherence(coherenceAnchors)

      // Verdict
      let verdict: string
      if (totalDriftFromOriginal < 0.02) {
        verdict = `Personality extremely stable. Total drift from original: ${totalDriftFromOriginal.toFixed(4)} (negligible). After ${behavioral.adaptationCount} adaptations, the agent has remained virtually identical to its original persona.`
      } else if (totalDriftFromOriginal < 0.05) {
        verdict = `Personality well-maintained. Total drift: ${totalDriftFromOriginal.toFixed(4)} (within normal bounds). ${behavioral.adaptationCount} adaptations applied. Most changed: ${weakestDim}. Most stable: ${strongestDim}.`
      } else if (totalDriftFromOriginal < 0.10) {
        verdict = `Moderate personality evolution detected. Total drift: ${totalDriftFromOriginal.toFixed(4)}. The agent has adapted ${behavioral.adaptationCount} times. While still recognizable, there are noticeable differences from the original persona, especially in ${weakestDim}.`
      } else {
        verdict = `SIGNIFICANT personality divergence. Total drift: ${totalDriftFromOriginal.toFixed(4)}. After ${behavioral.adaptationCount} adaptations, the agent may no longer closely match its original persona. Most diverged: ${weakestDim}. Consider drift correction or baseline reset.`
      }

      return {
        currentCoherence,
        totalDriftFromOriginal: Math.round(totalDriftFromOriginal * 10000) / 10000,
        strongestDimension: strongestDim,
        weakestDimension: weakestDim,
        adaptationsSinceCreation: behavioral.adaptationCount,
        verdict,
        detailedMetrics: detailedMetrics as unknown as { formality: { baseline: number; current: number; drift: number }; warmth: { baseline: number; current: number; drift: number }; depth: { baseline: number; current: number; drift: number }; directness: { baseline: number; current: number; drift: number }; empathy: { baseline: number; current: number; drift: number }; humorLevel: { baseline: number; current: number; drift: number }; verbosity: { baseline: number; current: number; drift: number }; proactivity: { baseline: number; current: number; drift: number } },
      }
    } catch (err) {
      logError(TAG, 'personality_benchmark_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Correction execution
  // ─────────────────────────────────────────────────────────

  private static async executeDriftCorrection(
    workspaceId: string,
    strength: number,
    reason: string,
  ): Promise<{ corrected: boolean; driftBefore: number; driftAfter: number }> {
    // Apply correction via DriftTracker
    // The DriftTracker.autoCorrect uses 0.7 internally,
    // so we adjust by passing a reason that indicates strength
    const result = await DriftTracker.autoCorrect(workspaceId, reason)

    // If strength is different from default, do an additional correction pass
    if (strength !== 0.7 && result.corrected) {
      const kernel = await PersonaKernel.get(workspaceId)
      if (kernel) {
        const baseline = await BaselineGenerator.getLatestBaseline(kernel.kernelId)
        if (baseline) {
          const currentDrift = await DriftTracker.measureCurrentDrift(workspaceId)
          // If still too high and we want harder correction, apply again
          if (currentDrift > COGNITIVE_DEFAULTS.DRIFT.correctionThreshold * 0.5 && strength > 0.8) {
            await DriftTracker.autoCorrect(workspaceId, `${reason}_aggressive_pass`)
          }
        }
      }
    }

    return {
      corrected: result.corrected,
      driftBefore: result.driftBefore,
      driftAfter: result.driftAfter,
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Classify health
  // ─────────────────────────────────────────────────────────

  static classifyHealth(coherence: number): CoherenceHealthGrade {
    for (const threshold of HEALTH_GRADE_THRESHOLDS) {
      if (coherence >= threshold.min) {
        return threshold.grade
      }
    }
    return 'broken'
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Determine correction policy
  // ─────────────────────────────────────────────────────────

  private static determineCorrectionPolicy(
    assessment: CoherenceAssessment,
    driftReport: { totalDrift: number; recommendation: string },
    regression: { hasRegression: boolean; regressionSeverity: string },
    healthGrade: CoherenceHealthGrade,
  ): CorrectionPolicy {
    // ── Critical: coherence broken ──
    if (healthGrade === 'broken') {
      return {
        action: 'manual_review',
        reason: `Coherence critically low (${assessment.overallCoherence.toFixed(3)}). Identity is fragmented. Manual intervention required.`,
        urgency: 'critical',
        autoExecutable: false,
      }
    }

    // ── Critical: coherence critical ──
    if (healthGrade === 'critical') {
      if (regression.hasRegression && regression.regressionSeverity === 'severe') {
        return {
          action: 'hard_correct',
          reason: `Critical coherence (${assessment.overallCoherence.toFixed(3)}) with severe regression. Aggressive drift correction needed.`,
          urgency: 'critical',
          autoExecutable: true,
        }
      }
      return {
        action: 'soft_correct',
        reason: `Critical coherence (${assessment.overallCoherence.toFixed(3)}). Standard drift correction.`,
        urgency: 'high',
        autoExecutable: true,
      }
    }

    // ── Degraded ──
    if (healthGrade === 'degraded') {
      if (driftReport.recommendation === 'rollback') {
        return {
          action: 'hard_correct',
          reason: `Degraded coherence (${assessment.overallCoherence.toFixed(3)}) with drift requiring rollback.`,
          urgency: 'high',
          autoExecutable: true,
        }
      }
      return {
        action: 'soft_correct',
        reason: `Degraded coherence (${assessment.overallCoherence.toFixed(3)}). Soft correction to stabilize.`,
        urgency: 'medium',
        autoExecutable: true,
      }
    }

    // ── Acceptable ──
    if (healthGrade === 'acceptable') {
      if (driftReport.recommendation === 'correct') {
        return {
          action: 'soft_correct',
          reason: `Acceptable coherence (${assessment.overallCoherence.toFixed(3)}) but drift correction recommended.`,
          urgency: 'low',
          autoExecutable: true,
        }
      }
      return {
        action: 'monitor',
        reason: `Acceptable coherence (${assessment.overallCoherence.toFixed(3)}). Continue monitoring.`,
        urgency: 'low',
        autoExecutable: true,
      }
    }

    // ── Good / Excellent ──
    if (healthGrade === 'good') {
      return {
        action: 'monitor',
        reason: `Good coherence (${assessment.overallCoherence.toFixed(3)}). Routine monitoring.`,
        urgency: 'low',
        autoExecutable: true,
      }
    }

    // ── Excellent ──
    return {
      action: 'none',
      reason: `Excellent coherence (${assessment.overallCoherence.toFixed(3)}). No action needed.`,
      urgency: 'low',
      autoExecutable: true,
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Analyze dimensions
  // ─────────────────────────────────────────────────────────

  private static analyzeDimensions(dimensions: CoherenceDimensions): {
    strongest: string
    weakest: string
    status: Record<string, 'healthy' | 'warning' | 'critical'>
  } {
    const entries = Object.entries(dimensions) as [string, number][]
    let strongest = entries[0][0]
    let weakest = entries[0][0]

    const status: Record<string, 'healthy' | 'warning' | 'critical'> = {}

    for (const [key, value] of entries) {
      if (value >= COGNITIVE_DEFAULTS.COHERENCE.minCoherenceThreshold) {
        status[key] = 'healthy'
      } else if (value >= COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold) {
        status[key] = 'warning'
      } else {
        status[key] = 'critical'
      }

      if (value > dimensions[strongest as keyof CoherenceDimensions]) strongest = key
      if (value < dimensions[weakest as keyof CoherenceDimensions]) weakest = key
    }

    return { strongest, weakest, status }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Generate recommendations
  // ─────────────────────────────────────────────────────────

  private static generateRecommendations(
    grade: CoherenceHealthGrade,
    drift: { totalDrift: number; recommendation: string; velocity: number },
    regression: { hasRegression: boolean; regressionSeverity: string; failingDimensions: string[] },
    anomalies: CoherenceAnomaly[],
    trend: { overall: string; slope: number; dataPointCount: number },
  ): string[] {
    const recommendations: string[] = []

    // Grade-based recommendations
    if (grade === 'broken' || grade === 'critical') {
      recommendations.push('URGENT: Identity coherence is in critical condition. Immediate investigation required.')
      recommendations.push('Consider pausing autonomous operations until coherence is restored.')
    }

    if (grade === 'degraded') {
      recommendations.push('Coherence is degraded. Schedule a drift correction within the next assessment cycle.')
    }

    // Drift-based
    if (drift.totalDrift > COGNITIVE_DEFAULTS.DRIFT.maxTotalDrift * 0.8) {
      recommendations.push(`Drift approaching maximum threshold (${drift.totalDrift.toFixed(4)} / ${COGNITIVE_DEFAULTS.DRIFT.maxTotalDrift}).`)
    }

    if (drift.velocity > 0.001) {
      recommendations.push(`Drift velocity is elevated (${drift.velocity.toFixed(6)}/hr). The personality is changing rapidly.`)
    }

    // Regression-based
    if (regression.hasRegression) {
      if (regression.regressionSeverity === 'severe') {
        recommendations.push(`SEVERE cognitive regression detected across ${regression.failingDimensions.length} dimensions: ${regression.failingDimensions.join(', ')}.`)
      } else if (regression.regressionSeverity === 'moderate') {
        recommendations.push(`Moderate regression. Monitor ${regression.failingDimensions.join(', ')} for further degradation.`)
      }
    }

    // Trend-based
    if (trend.overall === 'declining' && trend.slope < -0.01) {
      recommendations.push(`Coherence has been declining (slope: ${trend.slope.toFixed(4)}/snapshot). This is a negative trend over the last ${trend.dataPointCount} snapshots.`)
    }

    // Anomaly-based
    const criticalAnomalies = anomalies.filter((a) => a.severity === 'high' || a.severity === 'critical')
    if (criticalAnomalies.length > 3) {
      recommendations.push(`${criticalAnomalies.length} critical anomalies detected recently. This suggests systemic instability, not isolated incidents.`)
    }

    // If everything is fine
    if (recommendations.length === 0) {
      recommendations.push('All coherence metrics are within healthy ranges. No action required.')
    }

    return recommendations
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Utility methods
  // ─────────────────────────────────────────────────────────

  private static getStrongestDimension(deltas: Record<string, number>): string {
    return Object.entries(deltas).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown'
  }

  private static getWeakestDimension(deltas: Record<string, number>): string {
    return Object.entries(deltas).sort(([, a], [, b]) => a - b)[0]?.[0] ?? 'unknown'
  }
}

// ─── Report Types ──────────────────────────────────────────────

export interface CoherenceHealthReport {
  workspaceId: string
  timestamp: Date

  // Core metrics
  overallCoherence: number
  healthGrade: CoherenceHealthGrade
  driftMagnitude: number
  driftVelocity: number
  driftDirection: string

  // Dimensions
  dimensions: CoherenceDimensions
  dimensionAnalysis: {
    strongest: string
    weakest: string
    status: Record<string, 'healthy' | 'warning' | 'critical'>
  }

  // Regression
  hasRegression: boolean
  regressionSeverity: string
  regressionDelta: number
  failingDimensions: string[]

  // Trend
  trendDirection: string
  trendSlope: number
  trendR2: number
  dataPointCount: number

  // Anomalies
  recentAnomalies: CoherenceAnomaly[]
  criticalAnomalyCount: number

  // Correction
  correctionPolicy: CorrectionPolicy

  // Recommendations
  recommendations: string[]

  latencyMs: number
}

export interface LongitudinalComparisonReport {
  workspaceId: string
  periodALabel: string
  periodBLabel: string
  hasData: boolean
  coherenceA: number | null
  coherenceB: number | null
  delta: number
  healthGradeA: CoherenceHealthGrade | null
  healthGradeB: CoherenceHealthGrade | null
  dimensionDeltas: {
    personalityCoherence: number
    valueAlignment: number
    emotionalConsistency: number
    decisionCoherence: number
  }
  verdict: string
}

interface PersonalityBenchmark {
  detailedMetrics: {
    [key: string]: { baseline: number; current: number; drift: number }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default CoherenceMeter
