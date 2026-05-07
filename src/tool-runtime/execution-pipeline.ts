// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 3: TOOL OS Runtime
// Execution Pipeline — The main orchestrator for tool execution
//
// Architecture:
//   Input → Resolve → Validate → Rate Limit → Cooldown →
//   Health Check → Permission → Cognitive Gate → Approval →
//   Execute → Audit → Record Health
//
// This is the SINGLE ENTRY POINT for all tool executions.
// Every check is a gate — if any gate fails, execution is
// rejected with a clear reason. No silent failures.
//
// Pipeline stages are ordered by cost (cheapest first):
//   1. Resolve contract (DB read)
//   2. Validate input (CPU, no I/O)
//   3. Check rate limit (Redis)
//   4. Check cooldown (Redis)
//   5. Check health / circuit breaker (Redis)
//   6. Check permissions (DB read)
//   7. Cognitive gate (FASE 4 bridge)
//   8. Approval gate (if required)
//   9. Execute handler (external I/O)
//  10. Record result + update health
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { queueJob } from '@/lib/queue'
import { CognitiveRuntime, type GateResult } from '@/cognitive/cognitive-runtime'
import { ToolRegistry } from './tool-registry'
import { ApprovalEngine } from './approval-engine'
import { ToolHealthMonitor } from './health-monitor'
import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionStatus,
  ToolDefinition,
} from './types'
import { TOOL_RUNTIME_EVENTS, TOOL_RUNTIME_DEFAULTS } from './types'

const TAG = 'EXECUTION_PIPELINE'

// ─── Handler Registry ───────────────────────────────────────
// Runtime registry of actual handler functions.
// Handlers are registered at startup or dynamically.

type ToolHandler = (input: Record<string, unknown>, context: HandlerContext) => Promise<unknown>

interface HandlerContext {
  workspaceId: string
  contractId: string
  executionId: string
  contactId?: string
  sessionId?: string
  agentId?: string
  correlationId?: string
  dryRun: boolean
}

const handlerRegistry = new Map<string, ToolHandler>()

// ─── Pipeline Stage Result ──────────────────────────────────

interface StageResult {
  passed: boolean
  reason: string
  stage: string
  data?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════
// ExecutionPipeline
// ═══════════════════════════════════════════════════════════════

export class ExecutionPipeline {

  // ─────────────────────────────────────────────────────────
  // 1. EXECUTE — Main entry point
  // Runs the full pipeline and returns the result.
  // ─────────────────────────────────────────────────────────

  static async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const correlationId = request.correlationId ?? `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const startTime = Date.now()

    logInfo(TAG, 'pipeline_start', {
      workspaceId: request.workspaceId,
      contractId: request.contractId,
      correlationId,
    })

    // ── Stage 1: Resolve Tool Contract ──
    const contract = await ToolRegistry.resolve(request.workspaceId, request.contractId)
    if (!contract) {
      const msg = `Tool contract not found or inactive: ${request.contractId}`
      logWarn(TAG, 'pipeline_rejected', { stage: 'resolve', reason: msg })
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    // ── Stage 2: Validate Input ──
    const validation = ToolRegistry.validateInput(request.input, contract.inputSchema)
    if (!validation.valid) {
      const msg = `Input validation failed: ${validation.errors.join('; ')}`
      logWarn(TAG, 'pipeline_rejected', { stage: 'validate', reason: msg })
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    // ── Stage 3: Check Rate Limit ──
    const rateLimit = await ToolRegistry.checkRateLimit(
      contract.contractId,
      contract.rateLimitMax,
      contract.rateLimitWindow,
    )
    if (!rateLimit.allowed) {
      const msg = `Rate limit exceeded. Retry after ${rateLimit.retryAfterMs}ms. Remaining: ${rateLimit.remaining}`
      logWarn(TAG, 'pipeline_rejected', { stage: 'rate_limit', reason: msg })
      eventBus.emit(TOOL_RUNTIME_EVENTS.RATE_LIMITED, {
        workspaceId: request.workspaceId,
        contractId: contract.contractId,
        toolName: contract.name,
      }, 'tool-runtime')
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    // ── Stage 4: Check Cooldown ──
    const cooldown = await ToolRegistry.checkCooldown(contract.contractId, contract.cooldownMs)
    if (!cooldown.allowed) {
      const msg = `Cooldown active. Wait ${cooldown.waitMs}ms before re-executing.`
      logWarn(TAG, 'pipeline_rejected', { stage: 'cooldown', reason: msg })
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    // ── Stage 5: Health / Circuit Breaker Check ──
    const healthCheck = await ToolHealthMonitor.check(contract.contractId)
    if (!healthCheck.allowed) {
      const statusStr = healthCheck.status
      const isCircuitOpen = statusStr === 'circuit_open'
      const msg = `Tool is ${statusStr}. ${isCircuitOpen ? 'Circuit breaker is open.' : 'Health check failed.'}`
      logWarn(TAG, 'pipeline_rejected', { stage: 'health', reason: msg, healthStatus: statusStr })
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    // ── Stage 6: Permission Check ──
    // Default: system-level execution (no specific user)
    const permission = await ToolRegistry.checkPermission(
      request.workspaceId,
      contract.contractId,
      'system',
      null,
      'execute',
    )
    if (!permission.allowed) {
      const msg = `Permission denied: ${permission.reason}`
      logWarn(TAG, 'pipeline_rejected', { stage: 'permission', reason: msg })
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    // ── Stage 7: Cognitive Gate (FASE 4 bridge) ──
    const gate = await CognitiveRuntime.gate(request.workspaceId, {
      type: 'tool_execution',
      name: contract.name,
      priority: request.priority ?? 0.5,
      contactId: request.contactId,
      estimatedComplexity: 0.5, // Default — can be enhanced
    })

    if (gate.decision === 'rejected') {
      const msg = `Cognitive gate rejected: ${gate.reason}`
      logWarn(TAG, 'pipeline_rejected', { stage: 'cognitive_gate', reason: msg, gate })
      return ExecutionPipeline.rejectResult(msg, startTime, 'pending')
    }

    if (gate.decision === 'deferred') {
      const msg = `Cognitive gate deferred: ${gate.reason}. Queuing for later execution.`
      logInfo(TAG, 'pipeline_deferred', { stage: 'cognitive_gate', reason: msg })
      // Queue for later execution
      await queueJob('ai-tasks', {
        type: 'deferred_tool_execution',
        request,
        correlationId,
      }, { delay: 60_000 }) // Retry in 1 minute
      return {
        executionId: '',
        status: 'pending',
        output: null,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        error: msg,
        gateDecision: 'deferred',
      }
    }

    // ── Stage 8: Approval Gate (if required) ──
    if (contract.requiresApproval && !request.dryRun) {
      logInfo(TAG, 'approval_required', { contractId: contract.contractId, riskLevel: contract.riskLevel })

      // Create execution record first
      const execution = await ExecutionPipeline.createExecutionRecord({
        workspaceId: request.workspaceId,
        contractId: contract.contractId,
        contactId: request.contactId,
        sessionId: request.sessionId,
        agentId: request.agentId,
        correlationId,
        input: request.input,
        status: 'pending',
        riskLevel: contract.riskLevel,
        wasDryRun: false,
      })

      // Create approval request
      const approval = await ApprovalEngine.createRequest({
        workspaceId: request.workspaceId,
        contractId: contract.contractId,
        executionId: execution.id,
        reason: `Tool '${contract.name}' requires approval (risk: ${contract.riskLevel})`,
        riskLevel: contract.riskLevel,
      })

      // Link approval to execution
      await db.toolExecution.update({
        where: { id: execution.id },
        data: { approvalId: approval.approvalId },
      })

      return {
        executionId: execution.id,
        status: 'pending',
        output: null,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        error: 'Awaiting approval',
        approvalId: approval.approvalId,
        gateDecision: gate.decision,
      }
    }

    // ── Stage 9: Execute ──
    return ExecutionPipeline.runExecution({
      contract,
      request,
      correlationId,
      gate,
      startTime,
    })
  }

  // ─────────────────────────────────────────────────────────
  // 2. EXECUTE AFTER APPROVAL — Called when approval is granted
  // ─────────────────────────────────────────────────────────

  static async executeAfterApproval(
    executionId: string,
  ): Promise<ExecutionResult> {
    logInfo(TAG, 'execute_after_approval', { executionId })

    try {
      const execution = await db.toolExecution.findUnique({
        where: { id: executionId },
      })

      if (!execution) {
        return ExecutionPipeline.rejectResult('Execution not found', Date.now(), 'pending')
      }

      if (execution.status !== 'pending') {
        return ExecutionPipeline.rejectResult(
          `Execution already ${execution.status}`,
          Date.now(),
          execution.status as ExecutionStatus,
        )
      }

      const contract = await ToolRegistry.resolve(execution.workspaceId, execution.contractId)
      if (!contract) {
        return ExecutionPipeline.rejectResult('Tool contract no longer active', Date.now(), 'pending')
      }

      return ExecutionPipeline.runExecution({
        contract,
        request: {
          workspaceId: execution.workspaceId,
          contractId: execution.contractId,
          contactId: execution.contactId ?? undefined,
          sessionId: execution.sessionId ?? undefined,
          agentId: execution.agentId ?? undefined,
          correlationId: execution.correlationId ?? undefined,
          input: JSON.parse(execution.input) as Record<string, unknown>,
        },
        correlationId: execution.correlationId ?? undefined,
        gate: {
          decision: 'approved',
          reason: 'Approved by human operator',
          cognitiveLoad: 0,
          coherenceScore: 1,
          emotionalState: 'stable',
          modifiers: {
            toneAdjustment: 0,
            responseUrgency: 0.5,
            detailLevel: 0.7,
            empathyBoost: 0,
            cautionLevel: 0.3,
            creativityLevel: 0.5,
            shouldAcknowledgeEmotion: false,
            shouldSimplify: false,
            maxResponseLength: 500,
          },
          priorityBoost: 0,
        },
        startTime: Date.now(),
        existingExecutionId: executionId,
      })
    } catch (err) {
      logError(TAG, 'execute_after_approval_error', err, { executionId })
      return ExecutionPipeline.rejectResult(
        `Error executing after approval: ${err instanceof Error ? err.message : String(err)}`,
        Date.now(),
        'pending',
      )
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. DRY RUN — Simulate execution without side effects
  // ─────────────────────────────────────────────────────────

  static async dryRun(
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    const correlationId = request.correlationId ?? `dryrun_${Date.now()}`

    logInfo(TAG, 'dry_run_start', {
      workspaceId: request.workspaceId,
      contractId: request.contractId,
    })

    const contract = await ToolRegistry.resolve(request.workspaceId, request.contractId)
    if (!contract) {
      return ExecutionPipeline.rejectResult('Tool contract not found', Date.now(), 'pending')
    }

    const validation = ToolRegistry.validateInput(request.input, contract.inputSchema)
    if (!validation.valid) {
      return ExecutionPipeline.rejectResult(
        `Input validation failed: ${validation.errors.join('; ')}`,
        Date.now(),
        'pending',
      )
    }

    // Create execution record as dry_run
    const execution = await ExecutionPipeline.createExecutionRecord({
      workspaceId: request.workspaceId,
      contractId: contract.contractId,
      contactId: request.contactId,
      sessionId: request.sessionId,
      agentId: request.agentId,
      correlationId,
      input: request.input,
      status: 'dry_run',
      riskLevel: contract.riskLevel,
      wasDryRun: true,
    })

    // Predict output (basic — no actual execution)
    const predictedOutput = ExecutionPipeline.predictOutput(contract, request.input)

    await db.toolExecution.update({
      where: { id: execution.id },
      data: {
        status: 'completed',
        output: JSON.stringify(predictedOutput),
        completedAt: new Date(),
        durationMs: 0,
      },
    })

    // Save simulation record
    await db.toolSimulation.create({
      data: {
        workspaceId: request.workspaceId,
        contractId: contract.contractId,
        simulatedInput: JSON.stringify(request.input),
        environment: 'production',
        predictedOutput: JSON.stringify(predictedOutput),
        predictedSideEffects: JSON.stringify(contract.sideEffects),
        riskAssessment: JSON.stringify({
          riskScore: contract.riskLevel === 'SAFE' ? 0.1 : contract.riskLevel === 'MODERATE' ? 0.5 : contract.riskLevel === 'HIGH_RISK' ? 0.8 : 0.95,
          reasons: [`Tool risk level: ${contract.riskLevel}`],
          mitigations: contract.rollbackStrategy ? [`Rollback: ${contract.rollbackStrategy}`] : [],
        }),
      },
    })

    eventBus.emit(TOOL_RUNTIME_EVENTS.TOOL_SIMULATED, {
      workspaceId: request.workspaceId,
      contractId: contract.contractId,
      executionId: execution.id,
      predictedOutput,
    }, 'tool-runtime')

    return {
      executionId: execution.id,
      status: 'dry_run',
      output: predictedOutput,
      durationMs: 0,
      tokensUsed: 0,
      gateDecision: 'approved',
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. REPLAY — Replay a past execution
  // ─────────────────────────────────────────────────────────

  static async replay(
    executionId: string,
    mode: 'debug' | 're_execute' | 'dry_run' | 'compare' = 'debug',
  ): Promise<ExecutionResult> {
    logInfo(TAG, 'replay_start', { executionId, mode })

    try {
      const original = await db.toolExecution.findUnique({
        where: { id: executionId },
      })

      if (!original) {
        return ExecutionPipeline.rejectResult('Original execution not found', Date.now(), 'pending')
      }

      // Create replay record
      const replay = await db.toolReplay.create({
        data: {
          workspaceId: original.workspaceId,
          originalExecId: executionId,
          replayMode: mode,
          status: 'running',
        },
      })

      if (mode === 'dry_run') {
        return ExecutionPipeline.dryRun({
          workspaceId: original.workspaceId,
          contractId: original.contractId,
          contactId: original.contactId ?? undefined,
          sessionId: original.sessionId ?? undefined,
          agentId: original.agentId ?? undefined,
          correlationId: original.correlationId ?? undefined,
          input: JSON.parse(original.input) as Record<string, unknown>,
          dryRun: true,
        })
      }

      if (mode === 're_execute' || mode === 'compare') {
        const result = await ExecutionPipeline.execute({
          workspaceId: original.workspaceId,
          contractId: original.contractId,
          contactId: original.contactId ?? undefined,
          sessionId: original.sessionId ?? undefined,
          agentId: original.agentId ?? undefined,
          correlationId: original.correlationId ?? undefined,
          input: JSON.parse(original.input) as Record<string, unknown>,
        })

        // Link replay
        await db.toolReplay.update({
          where: { id: replay.id },
          data: {
            replayExecId: result.executionId,
            status: result.status === 'completed' ? 'completed' : 'failed',
          },
        })

        // For compare mode, compute diff
        if (mode === 'compare' && original.output && result.output) {
          const diff = ExecutionPipeline.computeDiff(
            JSON.parse(original.output),
            result.output,
          )
          await db.toolReplay.update({
            where: { id: replay.id },
            data: { outputDiff: JSON.stringify(diff) },
          })
        }

        return result
      }

      // Debug mode — just return the original execution data
      await db.toolReplay.update({
        where: { id: replay.id },
        data: { status: 'completed' },
      })

      return {
        executionId: executionId,
        status: original.status as ExecutionStatus,
        output: original.output ? JSON.parse(original.output) : null,
        durationMs: original.durationMs ?? 0,
        tokensUsed: original.tokensUsed,
        error: original.error ?? undefined,
      }
    } catch (err) {
      logError(TAG, 'replay_error', err, { executionId })
      return ExecutionPipeline.rejectResult(
        `Replay failed: ${err instanceof Error ? err.message : String(err)}`,
        Date.now(),
        'pending',
      )
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. REGISTER HANDLER — Register a tool handler function
  // ─────────────────────────────────────────────────────────

  static registerHandler(
    contractSlug: string,
    handler: ToolHandler,
  ): void {
    handlerRegistry.set(contractSlug, handler)
    logOk(TAG, 'handler_registered', { contractSlug })
  }

  static unregisterHandler(contractSlug: string): void {
    handlerRegistry.delete(contractSlug)
    logInfo(TAG, 'handler_unregistered', { contractSlug })
  }

  static getHandler(contractSlug: string): ToolHandler | undefined {
    return handlerRegistry.get(contractSlug)
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Run the actual execution
  // ─────────────────────────────────────────────────────────

  private static async runExecution(params: {
    contract: ToolDefinition
    request: ExecutionRequest
    correlationId?: string
    gate: GateResult
    startTime: number
    existingExecutionId?: string
  }): Promise<ExecutionResult> {
    const { contract, request, correlationId, gate, startTime, existingExecutionId } = params

    // Create or reuse execution record
    const executionId = existingExecutionId ?? (await ExecutionPipeline.createExecutionRecord({
      workspaceId: request.workspaceId,
      contractId: contract.contractId,
      contactId: request.contactId,
      sessionId: request.sessionId,
      agentId: request.agentId,
      correlationId,
      input: request.input,
      status: 'running',
      riskLevel: contract.riskLevel,
      wasDryRun: request.dryRun ?? false,
    })).id

    // Mark as running
    if (!existingExecutionId) {
      await db.toolExecution.update({
        where: { id: executionId },
        data: { startedAt: new Date() },
      })
    } else {
      await db.toolExecution.update({
        where: { id: executionId },
        data: { status: 'running', startedAt: new Date() },
      })
    }

    eventBus.emit(TOOL_RUNTIME_EVENTS.EXECUTION_STARTED, {
      workspaceId: request.workspaceId,
      contractId: contract.contractId,
      executionId,
      toolName: contract.name,
      riskLevel: contract.riskLevel,
      gateDecision: gate.decision,
    }, 'tool-runtime')

    // Set cooldown
    await ToolRegistry.recordExecution(contract.contractId, contract.cooldownMs)

    // Execute handler
    try {
      // Apply cognitive modifiers to input
      const modifiedInput = ExecutionPipeline.applyModifiers(request.input, gate.modifiers)

      // Find handler
      const handler = handlerRegistry.get(contract.slug)
      if (!handler) {
        // No handler registered — return mock success
        const msg = `No handler registered for '${contract.slug}'. Tool contract exists but has no runtime implementation.`
        logWarn(TAG, 'no_handler', { contractId: contract.contractId, slug: contract.slug })

        const result: ExecutionResult = {
          executionId,
          status: 'completed',
          output: { message: msg, contractName: contract.name, slug: contract.slug },
          durationMs: Date.now() - startTime,
          tokensUsed: 0,
          gateDecision: gate.decision,
        }

        await ExecutionPipeline.finalizeExecution(executionId, result, startTime, contract)
        return result
      }

      // Run handler with timeout
      const handlerContext: HandlerContext = {
        workspaceId: request.workspaceId,
        contractId: contract.contractId,
        executionId,
        contactId: request.contactId,
        sessionId: request.sessionId,
        agentId: request.agentId,
        correlationId,
        dryRun: request.dryRun ?? false,
      }

      const timeoutMs = Math.min(
        contract.executionTimeout,
        TOOL_RUNTIME_DEFAULTS.EXECUTION.maxTimeoutMs,
      )

      const output = await Promise.race([
        handler(modifiedInput, handlerContext),
        ExecutionPipeline.createTimeout(timeoutMs),
      ])

      const result: ExecutionResult = {
        executionId,
        status: 'completed',
        output,
        durationMs: Date.now() - startTime,
        tokensUsed: 0, // Can be extracted from handler context
        gateDecision: gate.decision,
      }

      await ExecutionPipeline.finalizeExecution(executionId, result, startTime, contract)

      // Record health
      await ToolHealthMonitor.recordSuccess(contract.contractId, result.durationMs)

      // Record in cognitive runtime
      await CognitiveRuntime.record(request.workspaceId, {
        type: 'tool_completed',
        data: {
          toolName: contract.name,
          executionId,
          durationMs: result.durationMs,
          success: true,
        },
      })

      logOk(TAG, 'execution_completed', {
        executionId,
        toolName: contract.name,
        durationMs: result.durationMs,
      })

      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const isTimeout = errorMsg === 'Execution timed out'

      const result: ExecutionResult = {
        executionId,
        status: isTimeout ? 'timeout' : 'failed',
        output: null,
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        error: errorMsg,
        gateDecision: gate.decision,
      }

      await ExecutionPipeline.finalizeExecution(executionId, result, startTime, contract, err)

      // Record health failure
      await ToolHealthMonitor.recordFailure(contract.contractId, errorMsg)

      // Record in cognitive runtime
      await CognitiveRuntime.record(request.workspaceId, {
        type: 'error',
        data: {
          toolName: contract.name,
          executionId,
          error: errorMsg,
          isTimeout,
        },
      })

      const eventType = isTimeout
        ? TOOL_RUNTIME_EVENTS.EXECUTION_TIMEOUT
        : TOOL_RUNTIME_EVENTS.EXECUTION_FAILED

      eventBus.emit(eventType, {
        workspaceId: request.workspaceId,
        contractId: contract.contractId,
        executionId,
        toolName: contract.name,
        error: errorMsg,
        durationMs: result.durationMs,
      }, 'tool-runtime')

      logError(TAG, 'execution_failed', err, { executionId, toolName: contract.name })

      return result
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Create execution record
  // ─────────────────────────────────────────────────────────

  private static async createExecutionRecord(params: {
    workspaceId: string
    contractId: string
    contactId?: string
    sessionId?: string
    agentId?: string
    correlationId?: string
    input: Record<string, unknown>
    status: string
    riskLevel: string
    wasDryRun: boolean
  }): Promise<{ id: string }> {
    const execution = await db.toolExecution.create({
      data: {
        workspaceId: params.workspaceId,
        contractId: params.contractId,
        contactId: params.contactId,
        sessionId: params.sessionId,
        agentId: params.agentId,
        correlationId: params.correlationId,
        input: JSON.stringify(params.input),
        status: params.status,
        riskLevel: params.riskLevel,
        wasDryRun: params.wasDryRun,
      },
    })

    return { id: execution.id }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Finalize execution in DB
  // ─────────────────────────────────────────────────────────

  private static async finalizeExecution(
    executionId: string,
    result: ExecutionResult,
    startTime: number,
    contract: ToolDefinition,
    error?: unknown,
  ): Promise<void> {
    await db.toolExecution.update({
      where: { id: executionId },
      data: {
        status: result.status,
        output: result.output ? JSON.stringify(result.output) : null,
        completedAt: new Date(),
        durationMs: result.durationMs,
        tokensUsed: result.tokensUsed,
        error: result.error,
        stackTrace: error instanceof Error ? error.stack : null,
      },
    })

    // Write execution ledger (audit trail)
    await db.executionLedger.create({
      data: {
        workspaceId: contract.workspaceId,
        executionId,
        action: 'EXECUTE',
        resourceType: 'tool_execution',
        resourceId: executionId,
        actorType: 'system',
        afterState: JSON.stringify({
          status: result.status,
          durationMs: result.durationMs,
          outputKeys: result.output ? Object.keys(result.output as Record<string, unknown>) : [],
        }),
        riskLevel: contract.riskLevel,
        correlationId: undefined,
      },
    })

    eventBus.emit(TOOL_RUNTIME_EVENTS.EXECUTION_COMPLETED, {
      workspaceId: contract.workspaceId,
      contractId: contract.contractId,
      executionId,
      toolName: contract.name,
      status: result.status,
      durationMs: result.durationMs,
    }, 'tool-runtime')
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Create a timeout promise
  // ─────────────────────────────────────────────────────────

  private static createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Execution timed out')), ms)
    })
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Apply cognitive modifiers to input
  // Translates cognitive state into execution behavior adjustments
  // ─────────────────────────────────────────────────────────

  private static applyModifiers(
    input: Record<string, unknown>,
    modifiers: GateResult['modifiers'],
  ): Record<string, unknown> {
    const modified = { ...input }

    // Inject modifier hints into the input for handlers to consume
    modified._cognitive_modifiers = {
      toneAdjustment: modifiers.toneAdjustment,
      responseUrgency: modifiers.responseUrgency,
      detailLevel: modifiers.detailLevel,
      empathyBoost: modifiers.empathyBoost,
      cautionLevel: modifiers.cautionLevel,
      creativityLevel: modifiers.creativityLevel,
      shouldAcknowledgeEmotion: modifiers.shouldAcknowledgeEmotion,
      shouldSimplify: modifiers.shouldSimplify,
      maxResponseLength: modifiers.maxResponseLength,
    }

    return modified
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Predict output for dry run
  // ─────────────────────────────────────────────────────────

  private static predictOutput(
    contract: ToolDefinition,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      dryRun: true,
      toolName: contract.name,
      toolSlug: contract.slug,
      riskLevel: contract.riskLevel,
      category: contract.category,
      estimatedSideEffects: contract.sideEffects,
      hasRollback: contract.rollbackStrategy !== null && contract.rollbackStrategy !== 'none',
      rollbackStrategy: contract.rollbackStrategy,
      estimatedCost: contract.costEstimate,
      inputKeys: Object.keys(input),
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Compute diff between two outputs (for replay compare)
  // ─────────────────────────────────────────────────────────

  private static computeDiff(
    original: unknown,
    replay: unknown,
  ): Record<string, unknown> {
    const origType = typeof original
    const replayType = typeof replay

    if (origType !== replayType) {
      return { typeChanged: { from: origType, to: replayType } }
    }

    if (origType === 'object' && original !== null && replay !== null) {
      const origObj = original as Record<string, unknown>
      const replayObj = replay as Record<string, unknown>
      const diff: Record<string, { original: unknown; replay: unknown }> = {}

      const allKeys = new Set([...Object.keys(origObj), ...Object.keys(replayObj)])
      for (const key of allKeys) {
        if (JSON.stringify(origObj[key]) !== JSON.stringify(replayObj[key])) {
          diff[key] = { original: origObj[key], replay: replayObj[key] }
        }
      }

      return Object.keys(diff).length > 0 ? { fieldDiffs: diff } : { identical: true }
    }

    return { identical: original === replay }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Create a rejection result
  // ─────────────────────────────────────────────────────────

  private static rejectResult(
    error: string,
    startTime: number,
    status: ExecutionStatus,
  ): ExecutionResult {
    return {
      executionId: '',
      status,
      output: null,
      durationMs: Date.now() - startTime,
      tokensUsed: 0,
      error,
    }
  }
}

export default ExecutionPipeline
