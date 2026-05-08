// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 3: TOOL OS Runtime
// Tool Registry — Central registry for managing tool contracts
//
// Responsibilities:
//   - Registration & resolution of tool contracts
//   - Rate limiting (Redis-backed sliding window)
//   - Cooldown enforcement (Redis-backed)
//   - Input validation (JSON Schema)
//   - Permission checking
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn, safeJsonParse } from '@/lib/logger'
import { getRedis } from '@/lib/redis'
import type {
  ToolDefinition,
  RiskLevel,
  RateLimitResult,
  CooldownResult,
} from './types'

const TAG = 'TOOL_REGISTRY'

// ─── Redis Key Builders ─────────────────────────────────────

function rateLimitKey(contractId: string): string {
  return `tool:ratelimit:${contractId}`
}

function cooldownKey(contractId: string): string {
  return `tool:cooldown:${contractId}`
}

function rateLimitBurstKey(contractId: string): string {
  return `tool:ratelimit:burst:${contractId}`
}

// ═══════════════════════════════════════════════════════════════
// ToolRegistry
// ═══════════════════════════════════════════════════════════════

export class ToolRegistry {

  // ─────────────────────────────────────────────────────────
  // 1. RESOLVE — Get a tool contract by ID or slug
  // Returns null if not found or inactive
  // ─────────────────────────────────────────────────────────

  static async resolve(
    workspaceId: string,
    identifier: string,
  ): Promise<ToolDefinition | null> {
    try {
      const where = identifier.startsWith('cl_') || identifier.length > 20
        ? { id: identifier, workspaceId, isActive: true }
        : { slug: identifier, workspaceId, isActive: true }

      const contract = await db.toolContract.findFirst({
        where: {
          ...where,
          OR: [
            { id: identifier, workspaceId, isActive: true },
            { slug: identifier, workspaceId, isActive: true },
          ],
        },
      })

      if (!contract) return null

      return ToolRegistry.toDefinition(contract)
    } catch (err) {
      logError(TAG, 'resolve_error', err, { workspaceId, identifier })
      return null
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. RESOLVE MANY — Get all active contracts for a workspace
  // Optionally filter by category or risk level
  // ─────────────────────────────────────────────────────────

  static async resolveMany(
    workspaceId: string,
    filters?: {
      category?: string
      riskLevel?: RiskLevel
      includeInactive?: boolean
    },
  ): Promise<ToolDefinition[]> {
    try {
      const contracts = await db.toolContract.findMany({
        where: {
          workspaceId,
          ...(filters?.category && { category: filters.category }),
          ...(filters?.riskLevel && { riskLevel: filters.riskLevel }),
          ...(!filters?.includeInactive && { isActive: true }),
        },
        orderBy: { name: 'asc' },
      })

      return contracts.map(ToolRegistry.toDefinition)
    } catch (err) {
      logError(TAG, 'resolve_many_error', err, { workspaceId })
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. CHECK RATE LIMIT — Sliding window rate limiting
  // Uses Redis sorted sets for O(log n) sliding window
  // ─────────────────────────────────────────────────────────

  static async checkRateLimit(
    contractId: string,
    maxExecutions?: number,
    windowSeconds?: number,
  ): Promise<RateLimitResult> {
    try {
      const max = maxExecutions ?? 60
      const window = windowSeconds ?? 60
      const now = Date.now()
      const windowStart = now - (window * 1000)
      const key = rateLimitKey(contractId)

      // Use Redis pipeline for atomic check-and-set
      const rd = await getRedis()
      const pipeline = rd.pipeline()

      // Remove expired entries
      pipeline.zremrangebyscore(key, 0, windowStart)
      // Count current entries
      pipeline.zcard(key)
      // Add current request (with score = timestamp)
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`)
      // Set expiry on the key
      pipeline.expire(key, window + 1)

      const results = await pipeline.exec()

      const currentCount = results?.[1]?.[1] as number ?? 0
      const remaining = Math.max(0, max - currentCount)

      // Check burst limit too (shorter window)
      const burstKey = rateLimitBurstKey(contractId)
      const burstWindow = 1 // 1 second
      const burstMax = 10
      const burstStart = now - 1000

      await rd.zremrangebyscore(burstKey, 0, burstStart)
      const burstCount = await rd.zcard(burstKey)

      if (burstCount >= burstMax) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(now + 1000),
          retryAfterMs: 1000,
        }
      }

      if (currentCount >= max) {
        // Find when the oldest entry expires
        const oldest = await rd.zrange(key, 0, 0, 'WITHSCORES')
        const oldestTs = oldest?.[1] ? parseInt(oldest[1] as string, 10) : now
        const retryAfter = Math.max(0, oldestTs + (window * 1000) - now)

        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(oldestTs + (window * 1000)),
          retryAfterMs: retryAfter,
        }
      }

      return {
        allowed: true,
        remaining,
        resetAt: new Date(now + (window * 1000)),
      }
    } catch (err) {
      logError(TAG, 'rate_limit_error', err, { contractId })
      // Fail-open: allow on Redis error
      return { allowed: true, remaining: 100, resetAt: new Date(Date.now() + 60_000) }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. CHECK COOLDOWN — Prevent rapid re-execution
  // Uses Redis key with TTL for simple cooldown
  // ─────────────────────────────────────────────────────────

  static async checkCooldown(
    contractId: string,
    cooldownMs?: number,
  ): Promise<CooldownResult> {
    try {
      const cooldown = cooldownMs ?? 0
      if (cooldown <= 0) {
        return { allowed: true, waitMs: 0, lastExecutionAt: null }
      }

      const rd = await getRedis()
      const key = cooldownKey(contractId)
      const lastExec = await rd.get(key)

      if (!lastExec) {
        return { allowed: true, waitMs: 0, lastExecutionAt: null }
      }

      const lastExecTime = parseInt(lastExec, 10)
      const elapsed = Date.now() - lastExecTime
      const remaining = cooldown - elapsed

      if (remaining <= 0) {
        return { allowed: true, waitMs: 0, lastExecutionAt: new Date(lastExecTime) }
      }

      return {
        allowed: false,
        waitMs: remaining,
        lastExecutionAt: new Date(lastExecTime),
      }
    } catch (err) {
      logError(TAG, 'cooldown_error', err, { contractId })
      return { allowed: true, waitMs: 0, lastExecutionAt: null }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. RECORD EXECUTION — Update cooldown after execution
  // ─────────────────────────────────────────────────────────

  static async recordExecution(
    contractId: string,
    cooldownMs?: number,
  ): Promise<void> {
    try {
      const cooldown = cooldownMs ?? 0
      if (cooldown > 0) {
        const rd = await getRedis()
        const key = cooldownKey(contractId)
        await rd.set(key, Date.now().toString(), 'PX', cooldown)
      }
    } catch (err) {
      logError(TAG, 'record_execution_error', err, { contractId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 6. CLEANUP RATE LIMIT — Remove a rate limit entry on cancellation
  // ─────────────────────────────────────────────────────────

  static async cleanupRateLimitEntry(
    contractId: string,
    executionTimestamp?: number,
  ): Promise<void> {
    try {
      const rd = await getRedis()
      const key = rateLimitKey(contractId)
      const ts = executionTimestamp ?? Date.now()
      // Remove entries within a small window around the timestamp
      await rd.zremrangebyscore(key, ts - 1000, ts + 1000)
    } catch (err) {
      logError(TAG, 'cleanup_ratelimit_error', err, { contractId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. CHECK PERMISSION — Check if a grantee can use a tool
  // ─────────────────────────────────────────────────────────

  static async checkPermission(
    workspaceId: string,
    contractId: string,
    granteeType: string,
    granteeId: string | null,
    requiredPermission: string = 'execute',
  ): Promise<{ allowed: boolean; reason: string }> {
    try {
      // Check specific grantee permissions
      // expiresAt must be either in the future or null
      const permission = await db.toolPermission.findFirst({
        where: {
          workspaceId,
          contractId,
          granteeType,
          granteeId: granteeId ?? null,
          isActive: true,
          OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
        },
      })

      if (!permission) {
        // Check role-level fallback (no specific granteeId)
        if (granteeType === 'role') {
          return { allowed: false, reason: `No active permission found for role '${granteeId}' on this tool` }
        }
        // Try role-level fallback for user/agent
        const rolePermission = await db.toolPermission.findFirst({
          where: {
            workspaceId,
            contractId,
            granteeType: 'role',
            granteeId: null,
            isActive: true,
            OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
          },
        })
        if (!rolePermission) {
          return { allowed: false, reason: `No active permission found for ${granteeType} '${granteeId}' or any role` }
        }
        const perms = safeJsonParse(rolePermission.permissions, []) as string[]
        if (perms.includes(requiredPermission) || perms.includes('*')) {
          return { allowed: true, reason: 'Granted via role-level permission' }
        }
        return { allowed: false, reason: `Role-level permission does not include '${requiredPermission}'` }
      }

      const perms = safeJsonParse(permission.permissions, []) as string[]
      if (perms.includes(requiredPermission) || perms.includes('*')) {
        // Check additional conditions
        const conditions = safeJsonParse(permission.conditions, {}) as Record<string, unknown>
        if (conditions.timeWindow) {
          const tw = conditions.timeWindow as { start?: string; end?: string }
          const now = new Date()
          if (tw.start) {
            const [h, m] = tw.start.split(':').map(Number)
            if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) {
              return { allowed: false, reason: 'Outside permitted time window (before start)' }
            }
          }
          if (tw.end) {
            const [h, m] = tw.end.split(':').map(Number)
            if (now.getHours() > h || (now.getHours() === h && now.getMinutes() > m)) {
              return { allowed: false, reason: 'Outside permitted time window (after end)' }
            }
          }
        }
        return { allowed: true, reason: 'Permission granted' }
      }

      return { allowed: false, reason: `Permission '${requiredPermission}' not granted. Available: [${perms.join(', ')}]` }
    } catch (err) {
      logError(TAG, 'check_permission_error', err, { workspaceId, contractId, granteeType, granteeId })
      return { allowed: false, reason: 'Error checking permissions' }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 8. VALIDATE INPUT — Validate input against JSON Schema
  // Minimal schema validation (no external dependency).
  // Supports: type, required, minLength, maxLength, minimum,
  //           maximum, pattern, enum, minItems, maxItems
  // ─────────────────────────────────────────────────────────

  static validateInput(
    input: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // If no schema or empty schema, allow everything
    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true, errors: [] }
    }

    const schemaProperties = schema.properties as Record<string, Record<string, unknown>> | undefined
    const schemaRequired = schema.required as string[] | undefined

    if (!schemaProperties) return { valid: true, errors: [] }

    // Check required fields
    if (schemaRequired) {
      for (const field of schemaRequired) {
        if (input[field] === undefined || input[field] === null) {
          errors.push(`Required field '${field}' is missing`)
        }
      }
    }

    // Validate each provided field against schema
    for (const [field, value] of Object.entries(input)) {
      const propSchema = schemaProperties[field]
      if (!propSchema) continue // Unknown fields are allowed (open schema)

      const expectedType = propSchema.type as string | undefined

      if (expectedType) {
        const actualType = Array.isArray(value) ? 'array' : typeof value
        if (actualType !== expectedType) {
          errors.push(`Field '${field}' expected type '${expectedType}', got '${actualType}'`)
          continue
        }
      }

      // String validations
      if (typeof value === 'string') {
        if (propSchema.minLength !== undefined && value.length < (propSchema.minLength as number)) {
          errors.push(`Field '${field}' too short (min ${propSchema.minLength})`)
        }
        if (propSchema.maxLength !== undefined && value.length > (propSchema.maxLength as number)) {
          errors.push(`Field '${field}' too long (max ${propSchema.maxLength})`)
        }
        if (propSchema.pattern) {
          const regex = new RegExp(propSchema.pattern as string)
          if (!regex.test(value)) {
            errors.push(`Field '${field}' does not match pattern '${propSchema.pattern}'`)
          }
        }
        if (propSchema.enum && !(propSchema.enum as unknown[]).includes(value)) {
          errors.push(`Field '${field}' must be one of: [${(propSchema.enum as unknown[]).join(', ')}]`)
        }
      }

      // Number validations
      if (typeof value === 'number') {
        if (propSchema.minimum !== undefined && value < (propSchema.minimum as number)) {
          errors.push(`Field '${field}' below minimum (${propSchema.minimum})`)
        }
        if (propSchema.maximum !== undefined && value > (propSchema.maximum as number)) {
          errors.push(`Field '${field}' above maximum (${propSchema.maximum})`)
        }
      }

      // Array validations
      if (Array.isArray(value)) {
        if (propSchema.minItems !== undefined && value.length < (propSchema.minItems as number)) {
          errors.push(`Field '${field}' has too few items (min ${propSchema.minItems})`)
        }
        if (propSchema.maxItems !== undefined && value.length > (propSchema.maxItems as number)) {
          errors.push(`Field '${field}' has too many items (max ${propSchema.maxItems})`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  // ─────────────────────────────────────────────────────────
  // 9. GET COOLDOWN FOR RISK LEVEL — Helper to get default cooldowns
  // ─────────────────────────────────────────────────────────

  static getCooldownForRiskLevel(riskLevel: RiskLevel): number {
    switch (riskLevel) {
      case 'SAFE': return 0
      case 'MODERATE': return 5_000      // 5 seconds
      case 'HIGH_RISK': return 30_000    // 30 seconds
      case 'CRITICAL': return 120_000    // 2 minutes
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL: Convert Prisma contract to ToolDefinition
  // ─────────────────────────────────────────────────────────

  private static toDefinition(contract: {
    id: string; workspaceId: string; name: string; slug: string;
    description: string | null; category: string; riskLevel: string;
    version: number; isActive: boolean; permissions: string;
    cooldownMs: number; rateLimitMax: number; rateLimitWindow: number;
    requiresApproval: boolean; sideEffects: string; rollbackStrategy: string | null;
    costEstimate: string; executionTimeout: number; idempotent: boolean;
    handler: string | null; inputSchema: string; outputSchema: string;
    config: string;
  }): ToolDefinition {
    return {
      contractId: contract.id,
      workspaceId: contract.workspaceId,
      name: contract.name,
      slug: contract.slug,
      category: contract.category,
      riskLevel: contract.riskLevel as RiskLevel,
      version: contract.version,
      isActive: contract.isActive,
      permissions: safeJsonParse(contract.permissions, []) as string[],
      cooldownMs: contract.cooldownMs,
      rateLimitMax: contract.rateLimitMax,
      rateLimitWindow: contract.rateLimitWindow,
      requiresApproval: contract.requiresApproval,
      sideEffects: safeJsonParse(contract.sideEffects, []) as string[],
      rollbackStrategy: contract.rollbackStrategy,
      costEstimate: safeJsonParse(contract.costEstimate, {}) as Record<string, unknown>,
      executionTimeout: contract.executionTimeout,
      idempotent: contract.idempotent,
      handler: contract.handler,
      inputSchema: safeJsonParse(contract.inputSchema, {}) as Record<string, unknown>,
      outputSchema: safeJsonParse(contract.outputSchema, {}) as Record<string, unknown>,
      config: safeJsonParse(contract.config, {}) as Record<string, unknown>,
    }
  }
}

export default ToolRegistry
