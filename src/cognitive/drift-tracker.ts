// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Drift Tracker — Monitors identity drift, computes velocity,
// detects critical thresholds, and triggers auto-correction
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { PersonaKernel } from './persona-kernel'
import { BaselineGenerator } from './baseline-generator'
import {
  type DriftReport,
  type DriftDirection,
  type DriftRecommendation,
  type FieldDrift,
  type BehavioralLayer,
  type DriftConfig,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'DRIFT_TRACKER'
const DRIFT_HISTORY_CACHE_KEY = 'cognitive:drift_history'

// ═══════════════════════════════════════════════════════════════
// DriftTracker
// ═══════════════════════════════════════════════════════════════

export class DriftTracker {

  // ─────────────────────────────────────────────────────────
  // 1. ASSESS DRIFT
  // Computes a full drift assessment: total drift, per-field breakdown,
  // velocity, direction, and whether correction is needed.
  // This is the main entry point for drift monitoring.
  // ─────────────────────────────────────────────────────────

  static async assess(
    workspaceId: string,
  ): Promise<DriftReport> {
    logInfo(TAG, 'assess_start', { workspaceId })

    try {
      const kernel = await PersonaKernel.getOrThrow(workspaceId)
      const { kernelId, behavioral, driftConfig } = kernel

      // ── Get latest baseline ──
      const baseline = await BaselineGenerator.getLatestBaseline(kernelId)

      if (!baseline) {
        logWarn(TAG, 'no_baseline', { kernelId, workspaceId })
        return DriftTracker.emptyReport(kernelId, workspaceId, 'No baseline found')
      }

      // ── Compute total drift ──
      const totalDrift = BaselineGenerator.computeTotalDrift(behavioral, baseline)

      // ── Compute per-field drift ──
      const fieldDrifts = BaselineGenerator.computeFieldDrifts(behavioral, baseline)

      // ── Compute drift velocity (drift per day since last assessment) ──
      const velocity = await DriftTracker.computeDriftVelocity(
        workspaceId,
        kernelId,
        totalDrift,
      )

      // ── Determine direction ──
      const direction = DriftTracker.determineDirection(
        fieldDrifts,
        velocity,
      )

      // ── Determine recommendation ──
      const needsCorrection = totalDrift > driftConfig.correctionThreshold
      const recommendation = DriftTracker.getRecommendation(
        totalDrift,
        driftConfig,
        direction,
      )

      // ── Persist drift history for velocity computation ──
      await DriftTracker.recordDriftMeasurement(
        workspaceId,
        kernelId,
        totalDrift,
        velocity,
        direction,
        recommendation,
      )

      // ── Emit events for critical drift ──
      if (recommendation === 'correct' || recommendation === 'rollback') {
        logWarn(TAG, 'drift_correction_needed', {
          workspaceId,
          kernelId,
          totalDrift: totalDrift.toFixed(4),
          direction,
          recommendation,
        })

        try {
          await eventBus.emit(COGNITIVE_EVENTS.DRIFT_CRITICAL, {
            workspaceId,
            kernelId,
            totalDrift,
            velocity,
            direction,
            recommendation,
            criticalFields: fieldDrifts.filter((f) => f.isCritical).map((f) => f.field),
          }, TAG)
        } catch {
          // Event emission is non-critical
        }
      }

      const report: DriftReport = {
        kernelId,
        workspaceId,
        totalDrift,
        fieldDrifts,
        velocity,
        direction,
        lastAssessmentAt: new Date(),
        needsCorrection,
        recommendation,
      }

      logOk(TAG, 'assess_complete', {
        workspaceId,
        kernelId,
        totalDrift: totalDrift.toFixed(4),
        velocity: velocity.toFixed(6),
        direction,
        recommendation,
      })

      return report
    } catch (err) {
      logError(TAG, 'assess_error', err, { workspaceId })
      return DriftTracker.emptyReport(
        workspaceId,
        workspaceId,
        err instanceof Error ? err.message : 'Unknown error',
      )
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. AUTO-CORRECT
  // Reverts behavioral layer toward the baseline by a corrective amount.
  // The correction is proportional to the drift, with an upper cap.
  // Creates a new periodic baseline after correction.
  // ─────────────────────────────────────────────────────────

  static async autoCorrect(
    workspaceId: string,
    reason: string = 'auto_correction',
  ): Promise<{
    corrected: boolean
    driftBefore: number
    driftAfter: number
    correctedFields: string[]
  }> {
    logInfo(TAG, 'auto_correct_start', { workspaceId, reason })

    try {
      const report = await DriftTracker.assess(workspaceId)

      if (!report.needsCorrection) {
        logInfo(TAG, 'auto_correct_not_needed', {
          workspaceId,
          totalDrift: report.totalDrift.toFixed(4),
          recommendation: report.recommendation,
        })

        return {
          corrected: false,
          driftBefore: report.totalDrift,
          driftAfter: report.totalDrift,
          correctedFields: [],
        }
      }

      const kernel = await PersonaKernel.getOrThrow(workspaceId)
      const { behavioral, driftConfig, kernelId } = kernel
      const baseline = await BaselineGenerator.getLatestBaseline(kernelId)

      if (!baseline) {
        return { corrected: false, driftBefore: report.totalDrift, driftAfter: report.totalDrift, correctedFields: [] }
      }

      // ── Compute correction amount: revert 70% of drift toward baseline ──
      const correctionFactor = 0.7
      const correctedFields: string[] = []

      // Tone corrections
      const toneFields: (keyof typeof behavioral.toneProfile)[] = [
        'formality', 'warmth', 'depth', 'directness', 'empathy',
      ]

      const toneAdjustments: Partial<typeof behavioral.toneProfile> = {}
      for (const field of toneFields) {
        const current = behavioral.toneProfile[field]
        const target = baseline.toneProfile[field]
        const diff = current - target
        const correction = diff * correctionFactor

        if (Math.abs(correction) > 0.0001) {
          ;(toneAdjustments as Record<string, number>)[field] = current - correction
          correctedFields.push(`toneProfile.${field}`)
        }
      }

      // Scalar corrections
      const scalarCorrections: Partial<BehavioralLayer> = {}
      const scalarFields: Array<{ field: 'humorLevel' | 'verbosity' | 'proactivity'; baseline: number }> = [
        { field: 'humorLevel', baseline: baseline.humorLevel },
        { field: 'verbosity', baseline: baseline.verbosity },
        { field: 'proactivity', baseline: baseline.proactivity },
      ]

      for (const { field, baseline: b } of scalarFields) {
        const current = behavioral[field]
        const diff = current - b
        const correction = diff * correctionFactor

        if (Math.abs(correction) > 0.0001) {
          ;(scalarCorrections as Record<string, number>)[field] = current - correction
          correctedFields.push(field)
        }
      }

      // ── Apply correction via PersonaKernel.applyDrift ──
      const result = await PersonaKernel.applyDrift(
        workspaceId,
        { ...scalarCorrections, toneProfile: toneAdjustments as BehavioralLayer['toneProfile'] },
        reason,
      )

      const driftAfter = await DriftTracker.measureCurrentDrift(workspaceId)

      logOk(TAG, 'auto_correct_complete', {
        workspaceId,
        kernelId,
        driftBefore: report.totalDrift.toFixed(4),
        driftAfter: driftAfter.toFixed(4),
        correctedFields: correctedFields.length,
      })

      try {
        await eventBus.emit(COGNITIVE_EVENTS.DRIFT_CORRECTED, {
          workspaceId,
          kernelId,
          driftBefore: report.totalDrift,
          driftAfter,
          correctedFields,
          reason,
        }, TAG)
      } catch {
        // Non-critical
      }

      return {
        corrected: true,
        driftBefore: report.totalDrift,
        driftAfter,
        correctedFields,
      }
    } catch (err) {
      logError(TAG, 'auto_correct_error', err, { workspaceId })
      return { corrected: false, driftBefore: 0, driftAfter: 0, correctedFields: [] }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. SHOULD CREATE NEW BASELINE
  // Determines if drift has stabilized enough to warrant
  // capturing a new periodic baseline.
  // Criteria: velocity is very low for a sustained period.
  // ─────────────────────────────────────────────────────────

  static async shouldCreateNewBaseline(
    workspaceId: string,
  ): Promise<{ should: boolean; reason: string }> {
    const kernel = await PersonaKernel.get(workspaceId)

    if (!kernel) {
      return { should: false, reason: 'No kernel found' }
    }

    const { driftConfig, kernelId, behavioral } = kernel
    const baseline = await BaselineGenerator.getLatestBaseline(kernelId)

    if (!baseline) {
      return { should: false, reason: 'No baseline to compare against' }
    }

    const totalDrift = BaselineGenerator.computeTotalDrift(behavioral, baseline)

    // Don't create a new baseline if drift is too high
    if (totalDrift > driftConfig.correctionThreshold * 0.8) {
      return {
        should: false,
        reason: `Drift too high (${totalDrift.toFixed(4)}) to stabilize baseline`,
      }
    }

    // Check velocity — must be very low
    const velocity = await DriftTracker.computeDriftVelocity(
      workspaceId,
      kernelId,
      totalDrift,
    )

    const maxStabilizationVelocity = driftConfig.perInteractionDrift * 0.1

    if (velocity < maxStabilizationVelocity) {
      return {
        should: true,
        reason: `Drift has stabilized (velocity: ${velocity.toFixed(6)}, drift: ${totalDrift.toFixed(4)})`,
      }
    }

    return {
      should: false,
      reason: `Velocity too high (${velocity.toFixed(6)}) for baseline stabilization`,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. MEASURE CURRENT DRIFT
  // Quick helper that returns the current drift magnitude
  // without a full assessment report.
  // ─────────────────────────────────────────────────────────

  static async measureCurrentDrift(workspaceId: string): Promise<number> {
    const kernel = await PersonaKernel.get(workspaceId)
    if (!kernel) return 0

    const baseline = await BaselineGenerator.getLatestBaseline(kernel.kernelId)
    if (!baseline) return 0

    return BaselineGenerator.computeTotalDrift(kernel.behavioral, baseline)
  }

  // ─────────────────────────────────────────────────────────
  // 5. GET DRIFT HISTORY
  // Returns recent drift measurements for trend analysis.
  // ─────────────────────────────────────────────────────────

  static async getDriftHistory(
    workspaceId: string,
    limit: number = 30,
  ): Promise<Array<{
    driftAmount: number
    velocity: number
    direction: string
    recommendation: string
    assessedAt: Date
  }>> {
    try {
      // Drift history is stored in CoherenceSnapshot records
      // (each assessment creates a snapshot with drift data)
      const snapshots = await db.coherenceSnapshot.findMany({
        where: { workspaceId },
        select: {
          driftMagnitude: true,
          driftVelocity: true,
          driftDirection: true,
          overallCoherence: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return snapshots.map((s) => ({
        driftAmount: s.driftMagnitude,
        velocity: s.driftVelocity,
        direction: s.driftDirection,
        recommendation: s.overallCoherence < COGNITIVE_DEFAULTS.COHERENCE.minCoherenceThreshold
          ? 'correct'
          : s.overallCoherence < COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold
            ? 'rollback'
            : 'stable',
        assessedAt: s.createdAt,
      }))
    } catch {
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  private static async computeDriftVelocity(
    workspaceId: string,
    kernelId: string,
    currentDrift: number,
  ): Promise<number> {
    try {
      // Get the previous assessment from coherence snapshots
      const previous = await db.coherenceSnapshot.findFirst({
        where: { workspaceId, kernelId },
        select: { driftMagnitude: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: 1, // Skip the latest, get the one before it
      })

      if (!previous) return 0

      const timeDiffMs = Date.now() - previous.createdAt.getTime()
      if (timeDiffMs <= 0) return 0

      const driftDiff = currentDrift - previous.driftMagnitude
      // Velocity: drift change per hour
      return (driftDiff / timeDiffMs) * 3_600_000
    } catch {
      return 0
    }
  }

  private static determineDirection(
    fieldDrifts: FieldDrift[],
    velocity: number,
  ): DriftDirection {
    if (fieldDrifts.length === 0) return 'none'

    // Check for divergent drift (fields going in opposite directions)
    const positiveDrifts = fieldDrifts.filter((f) => {
      const current = f.currentValue as number
      const baseline = f.baselineValue as number
      return current > baseline
    }).length

    const negativeDrifts = fieldDrifts.filter((f) => {
      const current = f.currentValue as number
      const baseline = f.baselineValue as number
      return current < baseline
    }).length

    if (positiveDrifts > 0 && negativeDrifts > 0) {
      return 'divergent'
    }

    if (Math.abs(velocity) < 0.001) {
      return 'stable' as DriftDirection
    }

    // Determine dominant direction
    const totalDrift = fieldDrifts.reduce((sum, f) => sum + f.driftAmount, 0)
    const avgDrift = totalDrift / fieldDrifts.length

    if (avgDrift > 0.01) return 'positive'
    if (avgDrift < -0.01) return 'negative'

    return 'convergent'
  }

  private static getRecommendation(
    totalDrift: number,
    config: DriftConfig,
    direction: DriftDirection,
  ): DriftRecommendation {
    // Critical: total drift exceeds max
    if (totalDrift >= config.maxTotalDrift) return 'rollback'

    // High: total drift exceeds correction threshold
    if (totalDrift >= config.correctionThreshold) return 'correct'

    // Monitor: drift is present but not critical
    if (totalDrift >= config.correctionThreshold * 0.5) return 'monitor'

    // Divergent drift needs monitoring even at low levels
    if (direction === 'divergent') return 'monitor'

    return 'stable'
  }

  private static async recordDriftMeasurement(
    workspaceId: string,
    kernelId: string,
    totalDrift: number,
    velocity: number,
    direction: DriftDirection,
    recommendation: DriftRecommendation,
  ): Promise<void> {
    try {
      // We store drift data inside CoherenceSnapshot for historical tracking
      // The actual coherence snapshot is computed by CoherenceSnapshots class,
      // but we create a minimal record here for drift history purposes

      // Get previous coherence dimensions if they exist
      const previous = await db.coherenceSnapshot.findFirst({
        where: { workspaceId, kernelId },
        orderBy: { createdAt: 'desc' },
      })

      const now = new Date()
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)

      // Only create if no snapshot exists for today
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)

      const existingToday = await db.coherenceSnapshot.findFirst({
        where: {
          workspaceId,
          kernelId,
          periodStart: { gte: todayStart },
        },
      })

      if (existingToday) {
        // Update existing snapshot with new drift data
        await db.coherenceSnapshot.update({
          where: { id: existingToday.id },
          data: {
            driftMagnitude: totalDrift,
            driftVelocity: velocity,
            driftDirection: direction,
          },
        })
      } else {
        // Create a new snapshot for today
        const coherenceScore = previous
          ? Math.max(0, previous.overallCoherence - totalDrift * 2)
          : 1.0 - totalDrift

        await db.coherenceSnapshot.create({
          data: {
            workspaceId,
            kernelId,
            personalityCoherence: previous?.personalityCoherence ?? 1.0,
            valueAlignment: previous?.valueAlignment ?? 1.0,
            emotionalConsistency: previous?.emotionalConsistency ?? 1.0,
            decisionCoherence: previous?.decisionCoherence ?? 1.0,
            overallCoherence: Math.max(0, Math.min(1, coherenceScore)),
            driftMagnitude: totalDrift,
            driftVelocity: velocity,
            driftDirection: direction,
            anomalies: previous?.anomalies ?? '[]',
            anomalyCount: previous?.anomalyCount ?? 0,
            snapshotPeriod: 'daily',
            periodStart: todayStart,
            periodEnd: endOfDay,
          },
        })
      }
    } catch (err) {
      logError(TAG, 'record_measurement_error', err, { workspaceId })
    }
  }

  private static emptyReport(
    kernelId: string,
    workspaceId: string,
    reason: string,
  ): DriftReport {
    return {
      kernelId,
      workspaceId,
      totalDrift: 0,
      fieldDrifts: [],
      velocity: 0,
      direction: 'none',
      lastAssessmentAt: new Date(),
      needsCorrection: false,
      recommendation: 'stable',
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default DriftTracker
