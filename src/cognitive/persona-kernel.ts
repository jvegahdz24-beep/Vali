// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 4: NEXUS Cognitive Engine
// Persona Kernel — Persistent 3-layer identity system
// immutable_core + behavioral_layer (0.05% drift) + emotional_overlay
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/redis/index'
import {
  type KernelInitializationConfig,
  type KernelInitializationResult,
  type ImmutableCore,
  type BehavioralLayer,
  type EmotionalOverlay,
  type DriftConfig,
  type ToneProfile,
  type Mood,
  COGNITIVE_DEFAULTS,
} from './types'
import { BaselineGenerator } from './baseline-generator'

// ─── Constants ─────────────────────────────────────────────────

const TAG = 'PERSONA_KERNEL'
const CACHE_NAMESPACE = 'cognitive:kernel'
const CACHE_TTL_SECONDS = 3600 // 1 hour

// ─── Default Tone Profile ──────────────────────────────────────

const DEFAULT_TONE: ToneProfile = {
  formality: 0.6,
  warmth: 0.75,
  depth: 0.6,
  directness: 0.5,
  empathy: 0.8,
}

// ═══════════════════════════════════════════════════════════════
// PersonaKernel — Core Class
// ═══════════════════════════════════════════════════════════════

export class PersonaKernel {
  // ─────────────────────────────────────────────────────────
  // 1. INITIALIZE
  // Creates a new Persona Kernel for a workspace.
  // The immutable core is set ONCE and NEVER changes.
  // The behavioral layer starts from config defaults.
  // A baseline snapshot is captured for drift comparison.
  // ─────────────────────────────────────────────────────────

  static async initialize(
    workspaceId: string,
    config: KernelInitializationConfig,
  ): Promise<KernelInitializationResult> {
    const timerStart = Date.now()

    logInfo(TAG, 'initialize_start', { workspaceId, coreName: config.coreName })

    try {
      // ── Validate workspace exists ──
      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      })

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }

      // ── Check if kernel already exists for this workspace ──
      const existing = await db.personaKernel.findUnique({
        where: { workspaceId },
      })

      if (existing) {
        logWarn(TAG, 'kernel_already_exists', {
          workspaceId,
          kernelId: existing.id,
          coreName: existing.coreName,
        })
        throw new Error(
          `Persona Kernel already exists for workspace ${workspaceId}. ` +
          `Use PersonaKernel.get() or PersonaKernel.reinitialize() instead.`
        )
      }

      // ── Build immutable core ──
      const now = new Date()
      const core: ImmutableCore = {
        coreName: config.coreName,
        coreValues: config.coreValues,
        corePurpose: config.corePurpose,
        coreBoundaries: config.coreBoundaries,
        initializedAt: now,
      }

      // ── Build behavioral layer from config ──
      const behavioral: BehavioralLayer = {
        toneProfile: {
          formality: config.toneProfile?.formality ?? DEFAULT_TONE.formality,
          warmth: config.toneProfile?.warmth ?? DEFAULT_TONE.warmth,
          depth: config.toneProfile?.depth ?? DEFAULT_TONE.depth,
          directness: config.toneProfile?.directness ?? DEFAULT_TONE.directness,
          empathy: config.toneProfile?.empathy ?? DEFAULT_TONE.empathy,
        },
        humorLevel: config.humorLevel ?? 0.3,
        verbosity: config.verbosity ?? 0.5,
        proactivity: config.proactivity ?? 0.5,
        adaptationCount: 0,
        lastDriftAt: null,
      }

      // ── Build drift configuration ──
      const driftConfig: DriftConfig = {
        maxTotalDrift: config.driftConfig?.maxTotalDrift ?? COGNITIVE_DEFAULTS.DRIFT.maxTotalDrift,
        perInteractionDrift: config.driftConfig?.perInteractionDrift ?? COGNITIVE_DEFAULTS.DRIFT.perInteractionDrift,
        correctionThreshold: config.driftConfig?.correctionThreshold ?? COGNITIVE_DEFAULTS.DRIFT.correctionThreshold,
        frozenFields: config.driftConfig?.frozenFields ?? [...COGNITIVE_DEFAULTS.DRIFT.frozenFields],
        monitoredFields: config.driftConfig?.monitoredFields ?? [...COGNITIVE_DEFAULTS.DRIFT.monitoredFields],
        driftDecayRate: config.driftConfig?.driftDecayRate ?? COGNITIVE_DEFAULTS.DRIFT.driftDecayRate,
      }

      // ── Create kernel in database ──
      const kernel = await db.personaKernel.create({
        data: {
          workspaceId,
          coreName: core.coreName,
          coreValues: JSON.stringify(core.coreValues),
          corePurpose: core.corePurpose,
          coreBoundaries: JSON.stringify(core.coreBoundaries),
          initializedAt: core.initializedAt,

          toneProfile: JSON.stringify(behavioral.toneProfile),
          humorLevel: behavioral.humorLevel,
          verbosity: behavioral.verbosity,
          proactivity: behavioral.proactivity,
          adaptationCount: 0,
          lastDriftAt: null,

          currentMood: 'neutral',
          moodReason: null,
          moodSetAt: null,

          version: 1,
          previousVersion: null,

          metadata: JSON.stringify({
            driftConfig,
            initializationSource: 'manual',
          }),
        },
      })

      logOk(TAG, 'kernel_created', {
        kernelId: kernel.id,
        workspaceId,
        coreName: kernel.coreName,
      })

      // ── Generate baseline snapshot ──
      const baseline = await BaselineGenerator.captureInitialBaseline(
        kernel.id,
        workspaceId,
        behavioral,
      )

      // ── Cache the kernel ──
      await this.cacheKernel(kernel.id, workspaceId, {
        core,
        behavioral,
        mood: kernel.currentMood as Mood,
        moodReason: kernel.moodReason,
        moodSetAt: kernel.moodSetAt,
        version: kernel.version,
        driftConfig,
      })

      const latencyMs = Date.now() - timerStart

      logOk(TAG, 'initialize_complete', {
        kernelId: kernel.id,
        workspaceId,
        baselineId: baseline.id,
        latencyMs,
      })

      return {
        kernelId: kernel.id,
        workspaceId,
        core,
        behavioral,
        baselineId: baseline.id,
        firstCoherenceSnapshotId: baseline.coherenceSnapshotId,
        driftConfig,
        initializedAt: now,
      }
    } catch (err) {
      logError(TAG, 'initialize_error', err, { workspaceId })
      throw err
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. GET — Retrieve the persona kernel for a workspace
  // Returns cached version if available, otherwise loads from DB.
  // ─────────────────────────────────────────────────────────

  static async get(workspaceId: string): Promise<{
    kernelId: string
    core: ImmutableCore
    behavioral: BehavioralLayer
    mood: Mood
    moodReason: string | null
    moodSetAt: Date | null
    version: number
    driftConfig: DriftConfig
  } | null> {
    // Try cache first
    const cached = await cacheGet<ReturnType<typeof PersonaKernel['get']> | null>(
      CACHE_NAMESPACE,
      workspaceId,
    )

    if (cached) return cached

    // Load from DB
    const kernel = await db.personaKernel.findUnique({
      where: { workspaceId },
    })

    if (!kernel) return null

    const core: ImmutableCore = {
      coreName: kernel.coreName,
      coreValues: JSON.parse(kernel.coreValues),
      corePurpose: kernel.corePurpose,
      coreBoundaries: JSON.parse(kernel.coreBoundaries),
      initializedAt: kernel.initializedAt,
    }

    const behavioral: BehavioralLayer = {
      toneProfile: JSON.parse(kernel.toneProfile),
      humorLevel: kernel.humorLevel,
      verbosity: kernel.verbosity,
      proactivity: kernel.proactivity,
      adaptationCount: kernel.adaptationCount,
      lastDriftAt: kernel.lastDriftAt,
    }

    const metadata = JSON.parse(kernel.metadata)
    const driftConfig: DriftConfig = metadata.driftConfig ?? COGNITIVE_DEFAULTS.DRIFT

    const result = {
      kernelId: kernel.id,
      core,
      behavioral,
      mood: kernel.currentMood as Mood,
      moodReason: kernel.moodReason,
      moodSetAt: kernel.moodSetAt,
      version: kernel.version,
      driftConfig,
    }

    // Cache for future reads
    await this.cacheKernel(kernel.id, workspaceId, result)

    return result
  }

  // ─────────────────────────────────────────────────────────
  // 3. GET OR THROW — Like get() but throws if kernel doesn't exist
  // ─────────────────────────────────────────────────────────

  static async getOrThrow(workspaceId: string): Promise<NonNullable<Awaited<ReturnType<typeof PersonaKernel.get>>>> {
    const kernel = await this.get(workspaceId)
    if (!kernel) {
      throw new Error(`No Persona Kernel found for workspace ${workspaceId}. Initialize one first.`)
    }
    return kernel
  }

  // ─────────────────────────────────────────────────────────
  // 4. APPLY DRIFT — Adjust behavioral layer with bounded drift
  // Enforces per-interaction limits and total drift caps.
  // Returns the actual delta applied (may be less than requested).
  // ─────────────────────────────────────────────────────────

  static async applyDrift(
    workspaceId: string,
    adjustments: Partial<BehavioralLayer>,
    reason: string,
  ): Promise<{
    applied: Partial<BehavioralLayer>
    actualDeltas: Record<string, number>
    totalDriftBefore: number
    totalDriftAfter: number
    version: number
  }> {
    const kernel = await this.getOrThrow(workspaceId)
    const { behavioral, driftConfig, kernelId } = kernel

    logInfo(TAG, 'apply_drift_start', {
      workspaceId,
      kernelId,
      adjustmentFields: Object.keys(adjustments),
      reason,
    })

    // ── Calculate current total drift from baseline ──
    const baseline = await BaselineGenerator.getLatestBaseline(kernelId)
    const totalDriftBefore = baseline
      ? BaselineGenerator.computeTotalDrift(behavioral, baseline)
      : 0

    // ── Apply each adjustment with clamping ──
    const actualDeltas: Record<string, number> = {}

    // Tone profile adjustments
    if (adjustments.toneProfile) {
      for (const [key, value] of Object.entries(adjustments.toneProfile)) {
        const field = key as keyof ToneProfile
        const current = behavioral.toneProfile[field]
        const requested = value as number

        // Clamp: max drift per interaction
        const maxDelta = driftConfig.perInteractionDrift
        const rawDelta = requested - current
        const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, rawDelta))

        behavioral.toneProfile[field] = current + clampedDelta
        actualDeltas[`toneProfile.${field}`] = clampedDelta
      }
    }

    // Scalar adjustments (humor, verbosity, proactivity)
    for (const scalarField of ['humorLevel', 'verbosity', 'proactivity'] as const) {
      if (adjustments[scalarField] !== undefined) {
        const current = behavioral[scalarField]
        const requested = adjustments[scalarField]!

        const maxDelta = driftConfig.perInteractionDrift
        const rawDelta = requested - current
        const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, rawDelta))

        const updated = { ...behavioral }
        ;(updated as unknown as Record<string, number>)[scalarField] = current + clampedDelta
        Object.assign(behavioral, updated)
        actualDeltas[scalarField] = clampedDelta
      }
    }

    // ── Check total drift limit ──
    const totalDriftAfter = baseline
      ? BaselineGenerator.computeTotalDrift(behavioral, baseline)
      : totalDriftBefore + Object.values(actualDeltas).reduce((sum, d) => sum + Math.abs(d), 0)

    if (totalDriftAfter > driftConfig.maxTotalDrift) {
      // Reject the adjustment — would exceed maximum drift
      logWarn(TAG, 'drift_rejected_max_exceeded', {
        workspaceId,
        kernelId,
        totalDriftBefore,
        totalDriftAfter,
        maxDrift: driftConfig.maxTotalDrift,
        reason,
      })

      return {
        applied: {},
        actualDeltas: {},
        totalDriftBefore,
        totalDriftAfter: totalDriftBefore,
        version: kernel.version,
      }
    }

    // ── Persist to database ──
    const updated = await db.personaKernel.update({
      where: { id: kernelId },
      data: {
        toneProfile: JSON.stringify(behavioral.toneProfile),
        humorLevel: behavioral.humorLevel,
        verbosity: behavioral.verbosity,
        proactivity: behavioral.proactivity,
        adaptationCount: behavioral.adaptationCount + 1,
        lastDriftAt: new Date(),
        version: { increment: 1 },
      },
    })

    // ── Invalidate cache ──
    await cacheInvalidate(CACHE_NAMESPACE, workspaceId)

    logOk(TAG, 'drift_applied', {
      workspaceId,
      kernelId,
      totalDriftBefore,
      totalDriftAfter,
      deltaCount: Object.keys(actualDeltas).length,
      newVersion: updated.version,
      reason,
    })

    return {
      applied: adjustments,
      actualDeltas,
      totalDriftBefore,
      totalDriftAfter,
      version: updated.version,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. SET MOOD — Update the emotional overlay (ephemeral layer)
  // This is the fast-changing layer that resets contextually.
  // ─────────────────────────────────────────────────────────

  static async setMood(
    workspaceId: string,
    mood: Mood,
    reason?: string,
  ): Promise<void> {
    const kernel = await this.getOrThrow(workspaceId)

    await db.personaKernel.update({
      where: { id: kernel.kernelId },
      data: {
        currentMood: mood,
        moodReason: reason ?? null,
        moodSetAt: new Date(),
      },
    })

    await cacheInvalidate(CACHE_NAMESPACE, workspaceId)

    logInfo(TAG, 'mood_set', {
      workspaceId,
      kernelId: kernel.kernelId,
      mood,
      reason: reason ?? 'no reason',
    })
  }

  // ─────────────────────────────────────────────────────────
  // 6. GET CURRENT STATE — Convenience method that returns
  // everything needed for cognitive state synthesis
  // ─────────────────────────────────────────────────────────

  static async getCurrentState(workspaceId: string): Promise<{
    kernelId: string
    core: ImmutableCore
    behavioral: BehavioralLayer
    mood: Mood
    moodReason: string | null
    version: number
    driftConfig: DriftConfig
    baseline: Awaited<ReturnType<typeof BaselineGenerator.getLatestBaseline>> | null
    trustRecords: number
    activePromises: number
    recentEmotionalMomentum: number
  }> {
    const kernel = await this.getOrThrow(workspaceId)

    const [baseline, trustCount, promiseCount, momentum] = await Promise.all([
      BaselineGenerator.getLatestBaseline(kernel.kernelId),
      db.trustRecord.count({ where: { workspaceId, kernelId: kernel.kernelId } }),
      db.unresolvedPromise.count({
        where: { workspaceId, status: 'pending' },
      }),
      this.getRecentEmotionalMomentum(workspaceId),
    ])

    return {
      kernelId: kernel.kernelId,
      core: kernel.core,
      behavioral: kernel.behavioral,
      mood: kernel.mood,
      moodReason: kernel.moodReason,
      version: kernel.version,
      driftConfig: kernel.driftConfig,
      baseline,
      trustRecords: trustCount,
      activePromises: promiseCount,
      recentEmotionalMomentum: momentum,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. REINITIALIZE — Destroys and recreates a kernel
  // FORCED OPERATION — use with extreme caution.
  // Creates a new baseline, increments version chain.
  // ─────────────────────────────────────────────────────────

  static async reinitialize(
    workspaceId: string,
    config: KernelInitializationConfig,
  ): Promise<KernelInitializationResult> {
    logWarn(TAG, 'reinitialize_start', { workspaceId, coreName: config.coreName })

    // Delete existing kernel
    await db.personaKernel.deleteMany({
      where: { workspaceId },
    })

    await cacheInvalidate(CACHE_NAMESPACE, workspaceId)

    // Create new kernel
    return this.initialize(workspaceId, config)
  }

  // ─────────────────────────────────────────────────────────
  // 8. GET KERNEL VERSION HISTORY
  // Returns all version snapshots for a kernel
  // ─────────────────────────────────────────────────────────

  static async getVersionHistory(workspaceId: string): Promise<Array<{
    version: number
    adaptationCount: number
    lastDriftAt: Date | null
    updatedAt: Date
  }>> {
    const kernel = await this.getOrThrow(workspaceId)

    // Since we increment version but don't store history in DB,
    // we reconstruct from coherence snapshots which capture behavioral state
    const snapshots = await db.coherenceSnapshot.findMany({
      where: { workspaceId, kernelId: kernel.kernelId },
      select: {
        overallCoherence: true,
        driftMagnitude: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
      },
      orderBy: { periodStart: 'desc' },
      take: 30,
    })

    return snapshots.map((s) => ({
      version: 0, // We don't have per-snapshot version tracking yet
      adaptationCount: 0,
      lastDriftAt: s.createdAt,
      updatedAt: s.createdAt,
    }))
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Cache helpers
  // ─────────────────────────────────────────────────────────

  private static async cacheKernel(
    kernelId: string,
    workspaceId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await cacheSet(CACHE_NAMESPACE, workspaceId, { ...data, kernelId }, CACHE_TTL_SECONDS)
    } catch {
      // Cache is non-critical
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Get recent emotional momentum score
  // ─────────────────────────────────────────────────────────

  private static async getRecentEmotionalMomentum(workspaceId: string): Promise<number> {
    try {
      const recent = await db.emotionalMomentum.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        select: { momentumScore: true },
      })
      return recent?.momentumScore ?? 0
    } catch {
      return 0
    }
  }
}

// ─── Default Export ─────────────────────────────────────────────

export default PersonaKernel
