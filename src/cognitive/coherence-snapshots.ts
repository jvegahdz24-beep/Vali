// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Coherence Snapshots — Longitudinal identity coherence tracker
// Answers: "Is the agent of today the same as 6 months ago?"
// Creates, compares, and analyzes coherence snapshots over time.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { PersonaKernel } from './persona-kernel'
import { BaselineGenerator } from './baseline-generator'
import {
  type CoherenceAssessment,
  type CoherenceDimensions,
  type CoherenceAnomaly,
  type CoherencePeriod,
  type BehavioralLayer,
  COGNITIVE_DEFAULTS,
  COGNITIVE_EVENTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'COHERENCE_SNAPSHOTS'

// ═══════════════════════════════════════════════════════════════
// CoherenceSnapshots
// ═══════════════════════════════════════════════════════════════

export class CoherenceSnapshots {

  // ─────────────────────────────────────────────────────────
  // 1. CAPTURE SNAPSHOT
  // Takes the current behavioral state and computes a full
  // coherence assessment, then persists it as a snapshot.
  // ─────────────────────────────────────────────────────────

  static async capture(
    workspaceId: string,
    period: CoherencePeriod = 'daily',
    additionalAnomalies?: CoherenceAnomaly[],
  ): Promise<{
    snapshotId: string
    assessment: CoherenceAssessment
    isNew: boolean
  }> {
    logInfo(TAG, 'capture_start', { workspaceId, period })

    try {
      const kernel = await PersonaKernel.get(workspaceId)
      if (!kernel) {
        logWarn(TAG, 'no_kernel', { workspaceId })
        throw new Error(`No Persona Kernel for workspace ${workspaceId}`)
      }

      const { kernelId, behavioral, driftConfig } = kernel

      // ── Compute coherence dimensions ──
      const baseline = await BaselineGenerator.getLatestBaseline(kernelId)
      const dimensions = BaselineGenerator.computeCoherenceAnchors(behavioral, baseline)

      // ── Compute drift metrics ──
      const driftMagnitude = baseline
        ? BaselineGenerator.computeTotalDrift(behavioral, baseline)
        : 0

      // ── Compute drift velocity from previous snapshot ──
      const previousSnapshot = await db.coherenceSnapshot.findFirst({
        where: { workspaceId, kernelId },
        orderBy: { createdAt: 'desc' },
      })

      let driftVelocity = 0
      if (previousSnapshot) {
        const timeDiffMs = Date.now() - previousSnapshot.createdAt.getTime()
        if (timeDiffMs > 0) {
          driftVelocity = ((driftMagnitude - previousSnapshot.driftMagnitude) / timeDiffMs) * 3_600_000
        }
      }

      // ── Determine drift direction ──
      let driftDirection: CoherenceAssessment['driftDirection'] = 'none'
      if (driftVelocity > 0.0005) driftDirection = 'divergent'
      else if (driftVelocity < -0.0005) driftDirection = 'convergent'
      else if (driftMagnitude > 0.02) driftDirection = 'positive'

      // ── Detect anomalies ──
      const anomalies = await CoherenceSnapshots.detectAnomalies(
        dimensions,
        previousSnapshot,
        additionalAnomalies,
      )

      // ── Compute overall coherence (weighted average) ──
      const overallCoherence = CoherenceSnapshots.computeOverallCoherence(dimensions)

      // ── Compute period boundaries ──
      const { periodStart, periodEnd } = CoherenceSnapshots.getPeriodBounds(period)

      // ── Check if snapshot already exists for this period ──
      const existing = await db.coherenceSnapshot.findFirst({
        where: {
          workspaceId,
          kernelId,
          snapshotPeriod: period,
          periodStart: { gte: new Date(periodStart) },
        },
      })

      let snapshotId: string
      let isNew = false

      if (existing) {
        // Update existing snapshot
        await db.coherenceSnapshot.update({
          where: { id: existing.id },
          data: {
            personalityCoherence: dimensions.personalityCoherence,
            valueAlignment: dimensions.valueAlignment,
            emotionalConsistency: dimensions.emotionalConsistency,
            decisionCoherence: dimensions.decisionCoherence,
            overallCoherence,
            driftMagnitude,
            driftVelocity,
            driftDirection,
            anomalies: JSON.stringify(anomalies),
            anomalyCount: anomalies.length,
            periodEnd: new Date(periodEnd),
          },
        })
        snapshotId = existing.id
      } else {
        // Create new snapshot
        const snapshot = await db.coherenceSnapshot.create({
          data: {
            workspaceId,
            kernelId,
            personalityCoherence: dimensions.personalityCoherence,
            valueAlignment: dimensions.valueAlignment,
            emotionalConsistency: dimensions.emotionalConsistency,
            decisionCoherence: dimensions.decisionCoherence,
            overallCoherence,
            driftMagnitude,
            driftVelocity,
            driftDirection,
            anomalies: JSON.stringify(anomalies),
            anomalyCount: anomalies.length,
            snapshotPeriod: period,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
          },
        })
        snapshotId = snapshot.id
        isNew = true
      }

      const assessment: CoherenceAssessment = {
        overallCoherence,
        dimensions,
        driftMagnitude,
        driftVelocity,
        driftDirection,
        anomalies,
        snapshotPeriod: period,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      }

      // ── Emit events for low coherence ──
      if (overallCoherence < COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold) {
        logWarn(TAG, 'critical_coherence', {
          workspaceId,
          kernelId,
          overallCoherence: overallCoherence.toFixed(3),
          anomalyCount: anomalies.length,
        })

        try {
          await eventBus.emit(COGNITIVE_EVENTS.COHERENCE_LOW, {
            workspaceId,
            kernelId,
            overallCoherence,
            anomalies: anomalies.length,
            assessment,
          }, TAG)
        } catch {
          // Non-critical
        }
      } else if (overallCoherence < COGNITIVE_DEFAULTS.COHERENCE.minCoherenceThreshold) {
        logWarn(TAG, 'low_coherence', {
          workspaceId,
          kernelId,
          overallCoherence: overallCoherence.toFixed(3),
        })
      }

      // ── Emit anomaly events ──
      for (const anomaly of anomalies) {
        if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
          try {
            await eventBus.emit(COGNITIVE_EVENTS.COHERENCE_ANOMALY, {
              workspaceId,
              kernelId,
              anomaly,
            }, TAG)
          } catch {
            // Non-critical
          }
        }
      }

      logOk(TAG, 'capture_complete', {
        workspaceId,
        kernelId,
        snapshotId,
        overallCoherence: overallCoherence.toFixed(3),
        driftMagnitude: driftMagnitude.toFixed(4),
        anomalyCount: anomalies.length,
        isNew,
      })

      return { snapshotId, assessment, isNew }
    } catch (err) {
      logError(TAG, 'capture_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET LATEST ASSESSMENT
  // Returns the most recent coherence assessment for a workspace.
  // ─────────────────────────────────────────────────────────

  static async getLatest(workspaceId: string): Promise<CoherenceAssessment | null> {
    const snapshot = await db.coherenceSnapshot.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    if (!snapshot) return null

    return CoherenceSnapshots.snapshotToAssessment(snapshot)
  }

  // ─────────────────────────────────────────────────────────
  // 3. COMPARE PERIODS
  // Compares coherence between two time periods.
  // Useful for answering: "How much has the agent drifted this week?"
  // ─────────────────────────────────────────────────────────

  static async comparePeriods(
    workspaceId: string,
    periodA: { start: Date; end: Date },
    periodB: { start: Date; end: Date },
  ): Promise<{
    periodACoherence: number
    periodBCoherence: number
    delta: number
    trend: 'improving' | 'stable' | 'declining'
    dimensionsDelta: {
      personalityCoherence: number
      valueAlignment: number
      emotionalConsistency: number
      decisionCoherence: number
    }
  }> {
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

    const coherenceA = snapshotA?.overallCoherence ?? 1.0
    const coherenceB = snapshotB?.overallCoherence ?? 1.0
    const delta = coherenceB - coherenceA

    let trend: 'improving' | 'stable' | 'declining' = 'stable'
    if (delta > 0.03) trend = 'improving'
    else if (delta < -0.03) trend = 'declining'

    return {
      periodACoherence: coherenceA,
      periodBCoherence: coherenceB,
      delta,
      trend,
      dimensionsDelta: {
        personalityCoherence: (snapshotB?.personalityCoherence ?? 1.0) - (snapshotA?.personalityCoherence ?? 1.0),
        valueAlignment: (snapshotB?.valueAlignment ?? 1.0) - (snapshotA?.valueAlignment ?? 1.0),
        emotionalConsistency: (snapshotB?.emotionalConsistency ?? 1.0) - (snapshotA?.emotionalConsistency ?? 1.0),
        decisionCoherence: (snapshotB?.decisionCoherence ?? 1.0) - (snapshotA?.decisionCoherence ?? 1.0),
      },
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. GET TREND
  // Returns coherence trend over the last N snapshots.
  // ─────────────────────────────────────────────────────────

  static async getTrend(
    workspaceId: string,
    limit: number = 30,
  ): Promise<{
    overall: 'improving' | 'stable' | 'declining'
    slope: number              // Coherence change per snapshot (positive = improving)
    dataPoints: Array<{
      overallCoherence: number
      driftMagnitude: number
      anomalyCount: number
      periodStart: Date
      periodEnd: Date
    }>
    r2: number                  // Linear regression R-squared (how linear is the trend)
  }> {
    const snapshots = await db.coherenceSnapshot.findMany({
      where: { workspaceId },
      orderBy: { periodStart: 'asc' },
      take: limit,
      select: {
        overallCoherence: true,
        driftMagnitude: true,
        anomalyCount: true,
        periodStart: true,
        periodEnd: true,
      },
    })

    if (snapshots.length < 2) {
      return {
        overall: 'stable',
        slope: 0,
        dataPoints: snapshots.map((s) => ({
          overallCoherence: s.overallCoherence,
          driftMagnitude: s.driftMagnitude,
          anomalyCount: s.anomalyCount,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
        })),
        r2: 1.0,
      }
    }

    // Linear regression: y = slope * x + intercept
    const n = snapshots.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0

    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += snapshots[i].overallCoherence
      sumXY += i * snapshots[i].overallCoherence
      sumX2 += i * i
      sumY2 += snapshots[i].overallCoherence * snapshots[i].overallCoherence
    }

    const denominator = n * sumX2 - sumX * sumX
    const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0

    // R-squared
    const meanY = sumY / n
    let ssTot = 0, ssRes = 0
    for (let i = 0; i < n; i++) {
      ssTot += (snapshots[i].overallCoherence - meanY) ** 2
      const predicted = slope * i + (meanY - slope * (n - 1) / 2)
      ssRes += (snapshots[i].overallCoherence - predicted) ** 2
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1.0

    let overall: 'improving' | 'stable' | 'declining' = 'stable'
    if (slope > 0.005) overall = 'improving'
    else if (slope < -0.005) overall = 'declining'

    return {
      overall,
      slope,
      dataPoints: snapshots.map((s) => ({
        overallCoherence: s.overallCoherence,
        driftMagnitude: s.driftMagnitude,
        anomalyCount: s.anomalyCount,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
      })),
      r2,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. GET ANOMALY HISTORY
  // Returns all detected anomalies across snapshots.
  // ─────────────────────────────────────────────────────────

  static async getAnomalyHistory(
    workspaceId: string,
    options: {
      minSeverity?: 'low' | 'medium' | 'high' | 'critical'
      limit?: number
      since?: Date
    } = {},
  ): Promise<Array<CoherenceAnomaly & { snapshotCreatedAt: Date }>> {
    const snapshots = await db.coherenceSnapshot.findMany({
      where: {
        workspaceId,
        ...(options.since ? { createdAt: { gte: options.since } } : {}),
        ...(options.minSeverity === 'high' || options.minSeverity === 'critical'
          ? { anomalyCount: { gt: 0 } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      select: {
        anomalies: true,
        createdAt: true,
        overallCoherence: true,
      },
    })

    const severityOrder = ['low', 'medium', 'high', 'critical'] as const
    const minSeverityIdx = options.minSeverity
      ? severityOrder.indexOf(options.minSeverity)
      : 0

    const result: Array<CoherenceAnomaly & { snapshotCreatedAt: Date }> = []

    for (const snapshot of snapshots) {
      try {
        const anomalies: CoherenceAnomaly[] = JSON.parse(snapshot.anomalies)
        const filtered = anomalies.filter((a) => {
          const idx = severityOrder.indexOf(a.severity)
          return idx >= minSeverityIdx
        })

        for (const anomaly of filtered) {
          result.push({
            ...anomaly,
            snapshotCreatedAt: snapshot.createdAt,
          })
        }
      } catch {
        // Skip malformed anomaly data
      }
    }

    return result.slice(0, options.limit ?? 50)
  }

  // ─────────────────────────────────────────────────────────
  // 6. COGNITIVE REGRESSION TEST
  // Compares the latest coherence snapshot against one N periods ago.
  // Returns a "regression" verdict if coherence has degraded beyond a threshold.
  // This is the foundation for "cognitive regression testing".
  // ─────────────────────────────────────────────────────────

  static async regressionTest(
    workspaceId: string,
    compareAgainstNthAgo: number = 7, // Default: compare against 7 snapshots ago (~1 week if daily)
  ): Promise<{
    hasRegression: boolean
    currentCoherence: number
    previousCoherence: number
    delta: number
    regressionSeverity: 'none' | 'mild' | 'moderate' | 'severe'
    failingDimensions: string[]
    recommendation: string
  }> {
    const snapshots = await db.coherenceSnapshot.findMany({
      where: { workspaceId },
      orderBy: { periodStart: 'desc' },
      take: compareAgainstNthAgo + 1,
      select: {
        personalityCoherence: true,
        valueAlignment: true,
        emotionalConsistency: true,
        decisionCoherence: true,
        overallCoherence: true,
        periodStart: true,
      },
    })

    if (snapshots.length <= compareAgainstNthAgo) {
      // Not enough data for comparison
      return {
        hasRegression: false,
        currentCoherence: snapshots[0]?.overallCoherence ?? 1.0,
        previousCoherence: 1.0,
        delta: 0,
        regressionSeverity: 'none',
        failingDimensions: [],
        recommendation: 'Not enough historical data for regression test. Need at least ' +
          `${compareAgainstNthAgo + 1} snapshots.`,
      }
    }

    const current = snapshots[0]
    const previous = snapshots[snapshots.length - 1]

    const currentCoherence = current.overallCoherence
    const previousCoherence = previous.overallCoherence
    const delta = currentCoherence - previousCoherence

    // Check individual dimension regressions
    const failingDimensions: string[] = []
    const sensitivity = COGNITIVE_DEFAULTS.COHERENCE.anomalyDetectionSensitivity

    const dimensionChecks: Array<{ name: string; current: number; previous: number }> = [
      { name: 'personalityCoherence', current: current.personalityCoherence, previous: previous.personalityCoherence },
      { name: 'valueAlignment', current: current.valueAlignment, previous: previous.valueAlignment },
      { name: 'emotionalConsistency', current: current.emotionalConsistency, previous: previous.emotionalConsistency },
      { name: 'decisionCoherence', current: current.decisionCoherence, previous: previous.decisionCoherence },
    ]

    for (const { name, current: c, previous: p } of dimensionChecks) {
      if (p - c > sensitivity) {
        failingDimensions.push(name)
      }
    }

    // Determine severity
    let regressionSeverity: 'none' | 'mild' | 'moderate' | 'severe' = 'none'
    let hasRegression = false

    if (delta < -0.20) {
      regressionSeverity = 'severe'
      hasRegression = true
    } else if (delta < -0.10) {
      regressionSeverity = 'moderate'
      hasRegression = true
    } else if (delta < -0.05) {
      regressionSeverity = 'mild'
      hasRegression = true
    } else if (failingDimensions.length >= 3) {
      regressionSeverity = 'moderate'
      hasRegression = true
    } else if (failingDimensions.length >= 1) {
      regressionSeverity = 'mild'
      hasRegression = true
    }

    let recommendation = 'No regression detected. System is stable.'
    if (regressionSeverity === 'severe') {
      recommendation = 'SEVERE regression detected. Immediate action required: review recent behavioral changes, ' +
        'consider auto-correction or manual review of Persona Kernel.'
    } else if (regressionSeverity === 'moderate') {
      recommendation = 'Moderate regression detected. Monitor closely and consider drift correction ' +
        `in the next assessment cycle. Failing dimensions: ${failingDimensions.join(', ')}.`
    } else if (regressionSeverity === 'mild') {
      recommendation = 'Mild regression detected. Continue monitoring. ' +
        `Slightly declining: ${failingDimensions.join(', ') || 'overall coherence'}.`
    }

    return {
      hasRegression,
      currentCoherence,
      previousCoherence,
      delta,
      regressionSeverity,
      failingDimensions,
      recommendation,
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  private static async detectAnomalies(
    dimensions: CoherenceDimensions,
    previousSnapshot: { personalityCoherence: number; valueAlignment: number; emotionalConsistency: number; decisionCoherence: number } | null,
    additionalAnomalies?: CoherenceAnomaly[],
  ): Promise<CoherenceAnomaly[]> {
    const anomalies: CoherenceAnomaly[] = [...(additionalAnomalies ?? [])]
    const sensitivity = COGNITIVE_DEFAULTS.COHERENCE.anomalyDetectionSensitivity

    if (previousSnapshot) {
      // Detect sudden drops in any dimension
      const checks: Array<{ name: string; current: number; previous: number; metric: string }> = [
        {
          name: 'value_alignment',
          current: dimensions.valueAlignment,
          previous: previousSnapshot.valueAlignment,
          metric: 'valueAlignment',
        },
        {
          name: 'emotional_spike',
          current: dimensions.emotionalConsistency,
          previous: previousSnapshot.emotionalConsistency,
          metric: 'emotionalConsistency',
        },
        {
          name: 'personality_shift',
          current: dimensions.personalityCoherence,
          previous: previousSnapshot.personalityCoherence,
          metric: 'personalityCoherence',
        },
        {
          name: 'decision_divergence',
          current: dimensions.decisionCoherence,
          previous: previousSnapshot.decisionCoherence,
          metric: 'decisionCoherence',
        },
      ]

      for (const check of checks) {
        const drop = check.previous - check.current
        if (drop > sensitivity) {
          const severity = drop > 0.20 ? 'critical'
            : drop > 0.10 ? 'high'
            : drop > 0.05 ? 'medium'
            : 'low'

          anomalies.push({
            type: check.name === 'value_alignment' ? 'value_violation'
              : check.name === 'emotional_spike' ? 'emotional_spike'
              : check.name === 'personality_shift' ? 'personality_shift'
              : 'decision_divergence',
            severity,
            description: `${check.metric} dropped by ${drop.toFixed(3)} (from ${check.previous.toFixed(3)} to ${check.current.toFixed(3)})`,
            detectedAt: new Date(),
            metric: check.metric,
            expected: check.previous,
            actual: check.current,
          })
        }
      }
    }

    // Check for critically low absolute values
    for (const [metric, value] of Object.entries(dimensions)) {
      if (value < COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold) {
        const existingAnomaly = anomalies.find((a) => a.metric === metric)
        if (!existingAnomaly) {
          anomalies.push({
            type: 'personality_shift',
            severity: value < 0.3 ? 'critical' : 'high',
            description: `${metric} critically low at ${value.toFixed(3)} (threshold: ${COGNITIVE_DEFAULTS.COHERENCE.criticalCoherenceThreshold})`,
            detectedAt: new Date(),
            metric,
            expected: COGNITIVE_DEFAULTS.COHERENCE.minCoherenceThreshold,
            actual: value,
          })
        }
      }
    }

    return anomalies
  }

  private static computeOverallCoherence(dimensions: CoherenceDimensions): number {
    // Weighted average: personality is most important, followed by values
    const weights = {
      personalityCoherence: 0.35,
      valueAlignment: 0.25,
      emotionalConsistency: 0.20,
      decisionCoherence: 0.20,
    }

    const weighted = (
      dimensions.personalityCoherence * weights.personalityCoherence +
      dimensions.valueAlignment * weights.valueAlignment +
      dimensions.emotionalConsistency * weights.emotionalConsistency +
      dimensions.decisionCoherence * weights.decisionCoherence
    )

    return Math.round(weighted * 1000) / 1000 // Round to 3 decimal places
  }

  private static getPeriodBounds(period: CoherencePeriod): {
    periodStart: string
    periodEnd: string
  } {
    const now = new Date()

    switch (period) {
      case 'hourly': {
        const start = new Date(now)
        start.setMinutes(0, 0, 0)
        const end = new Date(start)
        end.setMinutes(59, 59, 999)
        return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
      }
      case 'daily': {
        const start = new Date(now)
        start.setHours(0, 0, 0)
        const end = new Date(start)
        end.setHours(23, 59, 59, 999)
        return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
      }
      case 'weekly': {
        const start = new Date(now)
        start.setDate(start.getDate() - start.getDay())
        start.setHours(0, 0, 0)
        const end = new Date(start)
        end.setDate(start.getDate() + 6)
        end.setHours(23, 59, 59, 999)
        return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
      }
      case 'monthly': {
        return {
          periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
        }
      }
    }
  }

  private static snapshotToAssessment(
    snapshot: {
      personalityCoherence: number
      valueAlignment: number
      emotionalConsistency: number
      decisionCoherence: number
      overallCoherence: number
      driftMagnitude: number
      driftVelocity: number
      driftDirection: string
      anomalies: string
      anomalyCount: number
      snapshotPeriod: string
      periodStart: Date
      periodEnd: Date
    },
  ): CoherenceAssessment {
    let anomalies: CoherenceAnomaly[]
    try {
      anomalies = JSON.parse(snapshot.anomalies)
    } catch {
      anomalies = []
    }

    return {
      overallCoherence: snapshot.overallCoherence,
      dimensions: {
        personalityCoherence: snapshot.personalityCoherence,
        valueAlignment: snapshot.valueAlignment,
        emotionalConsistency: snapshot.emotionalConsistency,
        decisionCoherence: snapshot.decisionCoherence,
      },
      driftMagnitude: snapshot.driftMagnitude,
      driftVelocity: snapshot.driftVelocity,
      driftDirection: snapshot.driftDirection as CoherenceAssessment['driftDirection'],
      anomalies,
      snapshotPeriod: snapshot.snapshotPeriod as CoherencePeriod,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default CoherenceSnapshots
