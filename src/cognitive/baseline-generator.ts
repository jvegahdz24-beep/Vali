// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Baseline Generator — Captures reference snapshots for drift comparison
// Without baselines, drift is unmeasurable.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import {
  type BaselineSnapshot,
  type BehavioralLayer,
  type ToneProfile,
  type CoherenceDimensions,
  type Mood,
  COGNITIVE_DEFAULTS,
} from './types'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'BASELINE_GENERATOR'
const COGNITIVE_SCHEMA_SNAPSHOT_TABLE = 'CoherenceSnapshot' // Prisma model reference

// ═══════════════════════════════════════════════════════════════
// BaselineGenerator
// ═══════════════════════════════════════════════════════════════

export class BaselineGenerator {

  // ─────────────────────────────────────────────────────────
  // 1. CAPTURE INITIAL BASELINE
  // Called once during PersonaKernel.initialize().
  // Stores the behavioral layer + coherence dimensions as the "reference point".
  // Also creates the first CoherenceSnapshot (all scores = 1.0 since there's
  // nothing to drift from yet).
  // ─────────────────────────────────────────────────────────

  static async captureInitialBaseline(
    kernelId: string,
    workspaceId: string,
    behavioral: BehavioralLayer,
  ): Promise<{
    id: string
    kernelId: string
    workspaceId: string
    createdAt: Date
    version: number
    coherenceSnapshotId: string
  }> {
    logInfo(TAG, 'capture_initial_start', { kernelId, workspaceId })

    try {
      // ── Compute initial coherence dimensions (all 1.0 = perfect coherence) ──
      const coherenceAnchors: CoherenceDimensions = {
        personalityCoherence: 1.0,
        valueAlignment: 1.0,
        emotionalConsistency: 1.0,
        decisionCoherence: 1.0,
      }

      // ── Create the first CoherenceSnapshot as the anchor ──
      const now = new Date()
      const endOfDay = new Date(now)
      endOfDay.setHours(23, 59, 59, 999)

      const coherenceSnapshot = await db.coherenceSnapshot.create({
        data: {
          workspaceId,
          kernelId,
          personalityCoherence: coherenceAnchors.personalityCoherence,
          valueAlignment: coherenceAnchors.valueAlignment,
          emotionalConsistency: coherenceAnchors.emotionalConsistency,
          decisionCoherence: coherenceAnchors.decisionCoherence,
          overallCoherence: 1.0,
          driftMagnitude: 0.0,
          driftVelocity: 0.0,
          driftDirection: 'none',
          anomalies: '[]',
          anomalyCount: 0,
          snapshotPeriod: 'daily',
          periodStart: now,
          periodEnd: endOfDay,
        },
      })

      // ── Store baseline metadata in the kernel's metadata JSON ──
      const kernel = await db.personaKernel.findUnique({
        where: { id: kernelId },
        select: { metadata: true },
      })

      if (kernel) {
        const metadata = JSON.parse(kernel.metadata)
        metadata.baseline = {
          version: 1,
          capturedAt: now.toISOString(),
          coherenceSnapshotId: coherenceSnapshot.id,
          toneProfile: behavioral.toneProfile,
          humorLevel: behavioral.humorLevel,
          verbosity: behavioral.verbosity,
          proactivity: behavioral.proactivity,
          coherenceAnchors,
        }
        metadata.baselineHistory = [
          {
            version: 1,
            capturedAt: now.toISOString(),
            coherenceSnapshotId: coherenceSnapshot.id,
            reason: 'initial',
          },
        ]

        await db.personaKernel.update({
          where: { id: kernelId },
          data: { metadata: JSON.stringify(metadata) },
        })
      }

      logOk(TAG, 'baseline_captured', {
        kernelId,
        workspaceId,
        coherenceSnapshotId: coherenceSnapshot.id,
      })

      return {
        id: `baseline_v1_${kernelId}`,
        kernelId,
        workspaceId,
        createdAt: now,
        version: 1,
        coherenceSnapshotId: coherenceSnapshot.id,
      }
    } catch (err) {
      logError(TAG, 'capture_initial_error', err, { kernelId, workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET LATEST BASELINE
  // Loads the most recent baseline for a kernel.
  // Baseline data is stored inside the kernel's metadata JSON.
  // ─────────────────────────────────────────────────────────

  static async getLatestBaseline(
    kernelId: string,
  ): Promise<BaselineSnapshot | null> {
    try {
      const kernel = await db.personaKernel.findUnique({
        where: { id: kernelId },
        select: { metadata: true, workspaceId: true, toneProfile: true, humorLevel: true, verbosity: true, proactivity: true, initializedAt: true },
      })

      if (!kernel) return null

      const metadata = JSON.parse(kernel.metadata)
      const baselineData = metadata.baseline

      if (!baselineData) {
        // No baseline captured yet — shouldn't happen if initialized correctly
        logWarn(TAG, 'no_baseline_found', { kernelId })
        return null
      }

      return {
        id: `baseline_v${baselineData.version}_${kernelId}`,
        kernelId,
        workspaceId: kernel.workspaceId,
        toneProfile: baselineData.toneProfile,
        humorLevel: baselineData.humorLevel,
        verbosity: baselineData.verbosity,
        proactivity: baselineData.proactivity,
        baselineMood: 'neutral' as Mood,
        baselineValence: 0,
        baselineArousal: 0,
        coherenceAnchors: baselineData.coherenceAnchors ?? {
          personalityCoherence: 1.0,
          valueAlignment: 1.0,
          emotionalConsistency: 1.0,
          decisionCoherence: 1.0,
        },
        baselineTrust: COGNITIVE_DEFAULTS.TRUST.initialTrust,
        createdAt: new Date(baselineData.capturedAt),
        version: baselineData.version,
        description: baselineData.reason ?? 'initial',
      }
    } catch (err) {
      logError(TAG, 'get_latest_baseline_error', err, { kernelId })
      return null
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. COMPUTE TOTAL DRIFT
  // Calculates the absolute drift between current behavioral state
  // and the baseline snapshot. Returns a 0.0–1.0 score.
  // ─────────────────────────────────────────────────────────

  static computeTotalDrift(
    current: BehavioralLayer,
    baseline: BaselineSnapshot,
  ): number {
    const toneFields: (keyof ToneProfile)[] = [
      'formality', 'warmth', 'depth', 'directness', 'empathy',
    ]

    let totalDrift = 0
    let fieldCount = 0

    // Tone profile drift (each 0.0–1.0 field)
    for (const field of toneFields) {
      const currentVal = current.toneProfile[field]
      const baselineVal = baseline.toneProfile[field]
      const drift = Math.abs(currentVal - baselineVal)
      totalDrift += drift
      fieldCount++
    }

    // Scalar field drift
    const scalars: { current: number; baseline: number }[] = [
      { current: current.humorLevel, baseline: baseline.humorLevel },
      { current: current.verbosity, baseline: baseline.verbosity },
      { current: current.proactivity, baseline: baseline.proactivity },
    ]

    for (const { current, baseline: b } of scalars) {
      const drift = Math.abs(current - b)
      totalDrift += drift
      fieldCount++
    }

    // Average drift across all fields
    return fieldCount > 0 ? totalDrift / fieldCount : 0
  }

  // ─────────────────────────────────────────────────────────
  // 4. COMPUTE FIELD DRIFT (per-field breakdown)
  // Returns individual drift amounts for each monitored field.
  // ─────────────────────────────────────────────────────────

  static computeFieldDrifts(
    current: BehavioralLayer,
    baseline: BaselineSnapshot,
  ): Array<{
    field: string
    currentValue: number
    baselineValue: number
    driftAmount: number
    isCritical: boolean
  }> {
    const results: Array<{
      field: string
      currentValue: number
      baselineValue: number
      driftAmount: number
      isCritical: boolean
    }> = []

    // Tone fields
    const toneFields: (keyof ToneProfile)[] = [
      'formality', 'warmth', 'depth', 'directness', 'empathy',
    ]

    for (const field of toneFields) {
      const currentVal = current.toneProfile[field]
      const baselineVal = baseline.toneProfile[field]
      const drift = Math.abs(currentVal - baselineVal)

      results.push({
        field: `toneProfile.${field}`,
        currentValue: currentVal,
        baselineValue: baselineVal,
        driftAmount: drift,
        isCritical: drift > COGNITIVE_DEFAULTS.DRIFT.correctionThreshold,
      })
    }

    // Scalar fields
    const scalarMap: Array<{ field: string; current: number; baseline: number }> = [
      { field: 'humorLevel', current: current.humorLevel, baseline: baseline.humorLevel },
      { field: 'verbosity', current: current.verbosity, baseline: baseline.verbosity },
      { field: 'proactivity', current: current.proactivity, baseline: baseline.proactivity },
    ]

    for (const { field, current, baseline: b } of scalarMap) {
      const drift = Math.abs(current - b)

      results.push({
        field,
        currentValue: current,
        baselineValue: b,
        driftAmount: drift,
        isCritical: drift > COGNITIVE_DEFAULTS.DRIFT.correctionThreshold,
      })
    }

    return results
  }

  // ─────────────────────────────────────────────────────────
  // 5. CREATE PERIODIC BASELINE
  // Called by background cognition jobs to capture a new baseline
  // after significant adaptation. NOT called every time drift occurs —
  // only when drift has stabilized (drift velocity is low).
  // ─────────────────────────────────────────────────────────

  static async createPeriodicBaseline(
    kernelId: string,
    workspaceId: string,
    behavioral: BehavioralLayer,
    reason: string,
  ): Promise<{
    id: string
    version: number
    previousVersion: number
  }> {
    logInfo(TAG, 'create_periodic_start', { kernelId, workspaceId, reason })

    try {
      const kernel = await db.personaKernel.findUnique({
        where: { id: kernelId },
        select: { metadata: true, version: true },
      })

      if (!kernel) {
        throw new Error(`Kernel ${kernelId} not found`)
      }

      const metadata = JSON.parse(kernel.metadata)
      const prevBaseline = metadata.baseline
      const history = metadata.baselineHistory || []
      const newVersion = (prevBaseline?.version ?? 0) + 1

      // ── Compute current coherence ──
      const coherenceAnchors = BaselineGenerator.computeCoherenceAnchors(
        behavioral,
        prevBaseline,
      )

      // ── Update kernel baseline ──
      metadata.baseline = {
        version: newVersion,
        capturedAt: new Date().toISOString(),
        coherenceSnapshotId: prevBaseline?.coherenceSnapshotId,
        toneProfile: behavioral.toneProfile,
        humorLevel: behavioral.humorLevel,
        verbosity: behavioral.verbosity,
        proactivity: behavioral.proactivity,
        coherenceAnchors,
      }

      metadata.baselineHistory = [
        ...history,
        {
          version: newVersion,
          capturedAt: new Date().toISOString(),
          coherenceSnapshotId: prevBaseline?.coherenceSnapshotId,
          reason,
        },
      ].slice(-20) // Keep last 20 baseline versions

      await db.personaKernel.update({
        where: { id: kernelId },
        data: {
          metadata: JSON.stringify(metadata),
          previousVersion: JSON.stringify(prevBaseline),
          version: newVersion,
        },
      })

      logOk(TAG, 'periodic_baseline_created', {
        kernelId,
        workspaceId,
        version: newVersion,
        previousVersion: prevBaseline?.version ?? 0,
        reason,
      })

      return {
        id: `baseline_v${newVersion}_${kernelId}`,
        version: newVersion,
        previousVersion: prevBaseline?.version ?? 0,
      }
    } catch (err) {
      logError(TAG, 'create_periodic_error', err, { kernelId, workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 6. COMPUTE COHERENCE ANCHORS
  // Compares current behavioral state against the baseline
  // to produce coherence dimension scores.
  // ─────────────────────────────────────────────────────────

  static computeCoherenceAnchors(
    current: BehavioralLayer,
    baseline: BaselineSnapshot | null,
  ): CoherenceDimensions {
    if (!baseline) {
      // No baseline — assume perfect coherence
      return {
        personalityCoherence: 1.0,
        valueAlignment: 1.0,
        emotionalConsistency: 1.0,
        decisionCoherence: 1.0,
      }
    }

    // Personality coherence: how close is the behavioral layer to baseline
    const totalDrift = BaselineGenerator.computeTotalDrift(current, baseline)
    const personalityCoherence = Math.max(0, 1.0 - (totalDrift / COGNITIVE_DEFAULTS.DRIFT.maxTotalDrift))

    // Value alignment: measures if core values are being reflected
    // (We can't directly measure this from behavioral data alone,
    // so we use personality coherence as a proxy with some noise)
    const valueAlignment = Math.min(1.0, personalityCoherence + 0.05)

    // Emotional consistency: based on tone stability
    const toneVariance = BaselineGenerator.computeToneVariance(current.toneProfile, baseline.toneProfile)
    const emotionalConsistency = Math.max(0, 1.0 - toneVariance * 2)

    // Decision coherence: overall stability metric
    const decisionCoherence = (personalityCoherence + emotionalConsistency) / 2

    return {
      personalityCoherence: Math.round(personalityCoherence * 1000) / 1000,
      valueAlignment: Math.round(valueAlignment * 1000) / 1000,
      emotionalConsistency: Math.round(emotionalConsistency * 1000) / 1000,
      decisionCoherence: Math.round(decisionCoherence * 1000) / 1000,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. GET BASELINE HISTORY
  // Returns the chain of all baseline versions for a kernel
  // ─────────────────────────────────────────────────────────

  static async getBaselineHistory(
    kernelId: string,
  ): Promise<Array<{
    version: number
    capturedAt: Date
    coherenceSnapshotId: string
    reason: string
  }>> {
    try {
      const kernel = await db.personaKernel.findUnique({
        where: { id: kernelId },
        select: { metadata: true },
      })

      if (!kernel) return []

      const metadata = JSON.parse(kernel.metadata)
      return (metadata.baselineHistory || []).map((entry: Record<string, unknown>) => ({
        version: entry.version as number,
        capturedAt: new Date(entry.capturedAt as string),
        coherenceSnapshotId: entry.coherenceSnapshotId as string,
        reason: (entry.reason as string) ?? 'unknown',
      }))
    } catch {
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Compute tone variance
  // Measures how much individual tone fields have changed
  // relative to the baseline.
  // ─────────────────────────────────────────────────────────

  private static computeToneVariance(
    current: ToneProfile,
    baseline: ToneProfile,
  ): number {
    const fields: (keyof ToneProfile)[] = ['formality', 'warmth', 'depth', 'directness', 'empathy']
    let sumSquaredDiffs = 0

    for (const field of fields) {
      const diff = current[field] - baseline[field]
      sumSquaredDiffs += diff * diff
    }

    // RMS of diffs (normalized by number of fields)
    return Math.sqrt(sumSquaredDiffs / fields.length)
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default BaselineGenerator
