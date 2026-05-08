// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 3: TOOL OS Runtime
// Tool Health Monitor — Circuit breaker & health tracking
//
// Architecture:
//   Circuit Breaker Pattern:
//     CLOSED  → Normal operation. Track successes/failures.
//     OPEN    → Tool is failing. All executions rejected.
//     HALF-OPEN → Testing. Allow limited executions to test recovery.
//
//   Health is tracked per-tool using Redis for fast reads
//   and PostgreSQL for historical data.
//
//   Transitions:
//     CLOSED → OPEN: when consecutiveFailures >= threshold
//     OPEN → HALF-OPEN: after resetTimeoutMs
//     HALF-OPEN → CLOSED: after N successful tests
//     HALF-OPEN → OPEN: on any failure
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getRedis } from '@/lib/redis'
import { logInfo, logOk, logError, logWarn } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import type { ToolHealthStatus } from './types'
import { TOOL_RUNTIME_EVENTS, TOOL_RUNTIME_DEFAULTS } from './types'

const TAG = 'HEALTH_MONITOR'

// ─── Redis Keys ────────────────────────────────────────────

function healthKey(contractId: string): string {
  return `tool:health:${contractId}`
}

function circuitKey(contractId: string): string {
  return `tool:circuit:${contractId}`
}

// ─── Circuit State ──────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half_open'

interface CircuitData {
  state: CircuitState
  consecutiveFailures: number
  consecutiveSuccesses: number
  halfOpenTests: number
  openedAt: number | null
  lastStateChange: number
}

// ═══════════════════════════════════════════════════════════════
// ToolHealthMonitor
// ═══════════════════════════════════════════════════════════════

export class ToolHealthMonitor {

  // ─────────────────────────────────────────────────────────
  // 1. CHECK — Check if a tool is healthy enough to execute
  // Returns the current health status and whether execution
  // should be allowed.
  // ─────────────────────────────────────────────────────────

  static async check(
    contractId: string,
  ): Promise<{ allowed: boolean; status: ToolHealthStatus['status']; health: ToolHealthStatus }> {
    try {
      const health = await ToolHealthMonitor.getHealth(contractId)

      const allowed = health.status !== 'circuit_open' &&
        health.status !== 'unhealthy'

      return { allowed, status: health.status, health }
    } catch (err) {
      logError(TAG, 'check_error', err, { contractId })
      // Fail-open: allow execution if health check fails
      const defaultHealth = ToolHealthMonitor.createDefaultHealth(contractId, 'healthy')
      return {
        allowed: true,
        status: 'healthy',
        health: defaultHealth,
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. RECORD SUCCESS — Record a successful execution
  // ─────────────────────────────────────────────────────────

  static async recordSuccess(
    contractId: string,
    durationMs: number,
  ): Promise<void> {
    try {
      const circuit = await ToolHealthMonitor.getCircuitData(contractId)

      switch (circuit.state) {
        case 'closed':
          circuit.consecutiveFailures = 0
          circuit.consecutiveSuccesses++
          break

        case 'half_open':
          circuit.consecutiveSuccesses++
          circuit.halfOpenTests++

          // If enough successful tests in half-open, close the circuit
          if (circuit.halfOpenTests >= TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.halfOpenMaxTests) {
            circuit.state = 'closed'
            circuit.consecutiveFailures = 0
            circuit.halfOpenTests = 0
            circuit.lastStateChange = Date.now()

            eventBus.emit(TOOL_RUNTIME_EVENTS.CIRCUIT_CLOSED, {
              contractId,
              reason: `Circuit closed after ${TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.halfOpenMaxTests} successful tests in half-open state`,
            }, 'tool-runtime')

            logOk(TAG, 'circuit_closed', { contractId })
          }
          break

        case 'open':
          // Ignore successes while circuit is open
          break
      }

      await ToolHealthMonitor.saveCircuitData(contractId, circuit)
      await ToolHealthMonitor.updateHealthMetrics(contractId, { durationMs, success: true })

      logInfo(TAG, 'success_recorded', { contractId, durationMs, circuitState: circuit.state })
    } catch (err) {
      logError(TAG, 'record_success_error', err, { contractId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. RECORD FAILURE — Record a failed execution
  // May open the circuit if consecutive failures exceed threshold
  // ─────────────────────────────────────────────────────────

  static async recordFailure(
    contractId: string,
    error?: string,
  ): Promise<void> {
    try {
      const circuit = await ToolHealthMonitor.getCircuitData(contractId)

      switch (circuit.state) {
        case 'closed':
          circuit.consecutiveFailures++
          circuit.consecutiveSuccesses = 0

          // Check if we should open the circuit
          if (circuit.consecutiveFailures >= TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.failureThreshold) {
            circuit.state = 'open'
            circuit.openedAt = Date.now()
            circuit.lastStateChange = Date.now()

            eventBus.emit(TOOL_RUNTIME_EVENTS.CIRCUIT_OPENED, {
              contractId,
              reason: `Circuit opened after ${circuit.consecutiveFailures} consecutive failures`,
              error,
            }, 'tool-runtime')

            logWarn(TAG, 'circuit_opened', {
              contractId,
              failures: circuit.consecutiveFailures,
            })
          }
          break

        case 'half_open':
          // Any failure in half-open → reopen circuit
          circuit.state = 'open'
          circuit.openedAt = Date.now()
          circuit.lastStateChange = Date.now()
          circuit.halfOpenTests = 0

          eventBus.emit(TOOL_RUNTIME_EVENTS.CIRCUIT_OPENED, {
            contractId,
            reason: 'Circuit reopened after failure in half-open state',
            error,
          }, 'tool-runtime')

          logWarn(TAG, 'circuit_reopened', { contractId })
          break

        case 'open':
          circuit.consecutiveFailures++
          break
      }

      await ToolHealthMonitor.saveCircuitData(contractId, circuit)
      await ToolHealthMonitor.updateHealthMetrics(contractId, { success: false, error })

      logInfo(TAG, 'failure_recorded', { contractId, circuitState: circuit.state })
    } catch (err) {
      logError(TAG, 'record_failure_error', err, { contractId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. GET HEALTH — Get full health status for a tool
  // Combines circuit state with execution metrics
  // ─────────────────────────────────────────────────────────

  static async getHealth(contractId: string): Promise<ToolHealthStatus> {
    try {
      const circuit = await ToolHealthMonitor.getCircuitData(contractId)

      // Check if circuit should transition from open to half-open
      if (circuit.state === 'open' && circuit.openedAt) {
        const elapsed = Date.now() - circuit.openedAt
        if (elapsed >= TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.resetTimeoutMs) {
          circuit.state = 'half_open'
          circuit.halfOpenTests = 0
          circuit.lastStateChange = Date.now()
          await ToolHealthMonitor.saveCircuitData(contractId, circuit)

          logInfo(TAG, 'circuit_half_open', { contractId })
        }
      }

      // Get execution metrics from DB (last 24h)
      const windowStart = new Date(
        Date.now() - TOOL_RUNTIME_DEFAULTS.HEALTH.monitoringWindowMs,
      )

      const [totalExecutions, successfulExecutions, failedExecutions, avgDuration, lastExecution, lastError] =
        await Promise.all([
          db.toolExecution.count({
            where: {
              contractId,
              createdAt: { gte: windowStart },
            },
          }),
          db.toolExecution.count({
            where: {
              contractId,
              status: 'completed',
              createdAt: { gte: windowStart },
            },
          }),
          db.toolExecution.count({
            where: {
              contractId,
              status: { in: ['failed', 'timeout'] },
              createdAt: { gte: windowStart },
            },
          }),
          db.toolExecution.aggregate({
            where: {
              contractId,
              status: 'completed',
              durationMs: { not: null },
              createdAt: { gte: windowStart },
            },
            _avg: { durationMs: true },
          }),
          db.toolExecution.findFirst({
            where: { contractId },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, status: true },
          }),
          db.toolExecution.findFirst({
            where: {
              contractId,
              status: { in: ['failed', 'timeout'] },
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
        ])

      const successRate = totalExecutions >= TOOL_RUNTIME_DEFAULTS.HEALTH.minSampleSize
        ? successfulExecutions / totalExecutions
        : 1.0 // Assume healthy if not enough data

      const errorRate = totalExecutions >= TOOL_RUNTIME_DEFAULTS.HEALTH.minSampleSize
        ? failedExecutions / totalExecutions
        : 0.0

      // Determine health status
      let status: ToolHealthStatus['status']
      if (circuit.state === 'open') {
        status = 'circuit_open'
      } else if (circuit.state === 'half_open') {
        status = 'degraded'
      } else if (successRate < TOOL_RUNTIME_DEFAULTS.HEALTH.unhealthyThreshold) {
        status = 'unhealthy'
      } else if (successRate < TOOL_RUNTIME_DEFAULTS.HEALTH.degradedThreshold) {
        status = 'degraded'
      } else {
        status = 'healthy'
      }

      // Get tool name from DB
      const contract = await db.toolContract.findUnique({
        where: { id: contractId },
        select: { name: true },
      })

      return {
        contractId,
        toolName: contract?.name ?? 'Unknown',
        status,
        successRate: Math.round(successRate * 1000) / 1000,
        avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
        errorRate: Math.round(errorRate * 1000) / 1000,
        lastExecutionAt: lastExecution?.createdAt ?? null,
        lastErrorAt: lastError?.createdAt ?? null,
        consecutiveFailures: circuit.consecutiveFailures,
        circuitBreakerThreshold: TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.failureThreshold,
        circuitBreakerResetsAt: circuit.openedAt
          ? new Date(circuit.openedAt + TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.resetTimeoutMs)
          : null,
        executionCount24h: totalExecutions,
      }
    } catch (err) {
      logError(TAG, 'get_health_error', err, { contractId })
      return ToolHealthMonitor.createDefaultHealth(contractId, 'healthy')
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. RESET — Manually reset circuit breaker to closed
  // ─────────────────────────────────────────────────────────

  static async reset(contractId: string): Promise<void> {
    const circuit: CircuitData = {
      state: 'closed',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      halfOpenTests: 0,
      openedAt: null,
      lastStateChange: Date.now(),
    }

    await ToolHealthMonitor.saveCircuitData(contractId, circuit)

    eventBus.emit(TOOL_RUNTIME_EVENTS.CIRCUIT_CLOSED, {
      contractId,
      reason: 'Manually reset by operator',
    }, 'tool-runtime')

    logOk(TAG, 'circuit_reset', { contractId })
  }

  // ─────────────────────────────────────────────────────────
  // 6. GET ALL HEALTH — Get health for all tools in workspace
  // ─────────────────────────────────────────────────────────

  static async getAllHealth(
    workspaceId: string,
  ): Promise<ToolHealthStatus[]> {
    try {
      const contracts = await db.toolContract.findMany({
        where: { workspaceId, isActive: true },
        select: { id: true },
      })

      const healthStatuses = await Promise.all(
        contracts.map((c) => ToolHealthMonitor.getHealth(c.id)),
      )

      return healthStatuses
    } catch (err) {
      logError(TAG, 'get_all_health_error', err, { workspaceId })
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. GET SUMMARY — High-level health summary for workspace
  // ─────────────────────────────────────────────────────────

  static async getSummary(
    workspaceId: string,
  ): Promise<{
    total: number
    healthy: number
    degraded: number
    unhealthy: number
    circuitOpen: number
    tools: ToolHealthStatus[]
  }> {
    const allHealth = await ToolHealthMonitor.getAllHealth(workspaceId)

    return {
      total: allHealth.length,
      healthy: allHealth.filter((h) => h.status === 'healthy').length,
      degraded: allHealth.filter((h) => h.status === 'degraded').length,
      unhealthy: allHealth.filter((h) => h.status === 'unhealthy').length,
      circuitOpen: allHealth.filter((h) => h.status === 'circuit_open').length,
      tools: allHealth,
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Get circuit data from Redis
  // ─────────────────────────────────────────────────────────

  private static async getCircuitData(contractId: string): Promise<CircuitData> {
    try {
      const redis = await getRedis()
      const key = circuitKey(contractId)
      const data = await redis.get(key)

      if (data) {
        return JSON.parse(data) as CircuitData
      }
    } catch (err) {
      logError(TAG, 'get_circuit_error', err, { contractId })
    }

    // Return default (closed) if not found
    return {
      state: 'closed',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      halfOpenTests: 0,
      openedAt: null,
      lastStateChange: Date.now(),
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Save circuit data to Redis
  // ─────────────────────────────────────────────────────────

  private static async saveCircuitData(
    contractId: string,
    data: CircuitData,
  ): Promise<void> {
    try {
      const redis = await getRedis()
      const key = circuitKey(contractId)
      const ttl = 24 * 3600 // 24 hours TTL
      await redis.set(key, JSON.stringify(data), 'EX', ttl)
    } catch (err) {
      logError(TAG, 'save_circuit_error', err, { contractId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Update health metrics in Redis
  // ─────────────────────────────────────────────────────────

  private static async updateHealthMetrics(
    contractId: string,
    update: { durationMs?: number; success: boolean; error?: string },
  ): Promise<void> {
    try {
      const redis = await getRedis()
      const key = healthKey(contractId)
      const current = await redis.get(key)
      const metrics = current
        ? JSON.parse(current) as Record<string, unknown>
        : {
            totalExecutions: 0,
            successCount: 0,
            failureCount: 0,
            totalDurationMs: 0,
            lastStatus: 'unknown',
            lastUpdatedAt: Date.now(),
          }

      metrics.totalExecutions = (metrics.totalExecutions as number) + 1
      metrics.lastUpdatedAt = Date.now()

      if (update.success) {
        metrics.successCount = (metrics.successCount as number) + 1
        metrics.lastStatus = 'success'
        if (update.durationMs) {
          metrics.totalDurationMs = (metrics.totalDurationMs as number) + update.durationMs
        }
      } else {
        metrics.failureCount = (metrics.failureCount as number) + 1
        metrics.lastStatus = 'failure'
        metrics.lastError = update.error ?? 'Unknown error'
        metrics.lastErrorAt = Date.now()
      }

      const ttl = 24 * 3600 // 24 hours
      await redis.set(key, JSON.stringify(metrics), 'EX', ttl)
    } catch (err) {
      logError(TAG, 'update_metrics_error', err, { contractId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Create default health status
  // ─────────────────────────────────────────────────────────

  private static createDefaultHealth(
    contractId: string,
    status: 'healthy' | 'degraded' | 'unhealthy' | 'circuit_open',
  ): ToolHealthStatus {
    return {
      contractId,
      toolName: 'Unknown',
      status,
      successRate: 1.0,
      avgDurationMs: 0,
      errorRate: 0,
      lastExecutionAt: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
      circuitBreakerThreshold: TOOL_RUNTIME_DEFAULTS.CIRCUIT_BREAKER.failureThreshold,
      circuitBreakerResetsAt: null,
      executionCount24h: 0,
    }
  }
}

export default ToolHealthMonitor
