// Types for the tool-runtime system

export type RiskLevel = 'SAFE' | 'MODERATE' | 'HIGH_RISK' | 'CRITICAL'
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled' | 'dry_run'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'
export type ReplayMode = 'debug' | 're_execute' | 'dry_run' | 'compare'
export type DAGStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'partial_rollback' | 'rolled_back'
export type DAGNodeStatus = 'pending' | 'ready' | 'executing' | 'completed' | 'failed' | 'skipped'

export interface ToolDefinition {
  contractId: string
  workspaceId: string
  name: string
  slug: string
  category: string
  riskLevel: RiskLevel
  version: number
  isActive: boolean
  permissions: string[]
  cooldownMs: number
  rateLimitMax: number
  rateLimitWindow: number
  requiresApproval: boolean
  sideEffects: string[]
  rollbackStrategy: string | null
  costEstimate: Record<string, unknown>
  executionTimeout: number
  idempotent: boolean
  handler: string | null
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  config: Record<string, unknown>
}

export interface ExecutionRequest {
  workspaceId: string
  contractId: string
  contactId?: string
  sessionId?: string
  agentId?: string
  input: Record<string, unknown>
  correlationId?: string
  dryRun?: boolean
  priority?: number
}

export interface ExecutionResult {
  executionId: string
  status: ExecutionStatus
  output: unknown
  durationMs: number
  tokensUsed: number
  error?: string
  gateDecision?: string
  approvalId?: string
}

export interface ApprovalRequest {
  workspaceId: string
  contractId: string
  executionId?: string
  reason: string
  context?: Record<string, unknown>
  riskLevel: RiskLevel
  requestedBy?: string
  expiresAt?: Date
}

export interface ApprovalResolution {
  approved: boolean
  resolvedBy: string
  note?: string
}

export interface IntentClassification {
  intentType: string
  description: string
  confidence: number
  entities: Record<string, unknown>
  urgency: 'low' | 'medium' | 'high' | 'critical'
  suggestedToolId: string | null
  suggestedToolSlug: string | null
  resolutionStrategy: 'automatic' | 'manual' | 'hybrid'
  estimatedRiskLevel: RiskLevel
}

export interface DAGDefinition {
  workspaceId: string
  sessionId?: string
  label?: string
  nodes: DAGNodeDefinition[]
}

export interface DAGNodeDefinition {
  contractId: string
  dependsOn: string[]
  inputMapping: Record<string, unknown>
  outputMapping: Record<string, unknown>
}

export interface ToolHealthStatus {
  contractId: string
  toolName: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'circuit_open'
  successRate: number
  avgDurationMs: number
  errorRate: number
  lastExecutionAt: Date | null
  lastErrorAt: Date | null
  consecutiveFailures: number
  circuitBreakerThreshold: number
  circuitBreakerResetsAt: Date | null
  executionCount24h: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfterMs?: number
}

export interface CooldownResult {
  allowed: boolean
  waitMs: number
  lastExecutionAt: Date | null
}

export const TOOL_RUNTIME_EVENTS = {
  TOOL_REGISTERED: 'tool.registered',
  TOOL_UNREGISTERED: 'tool.unregistered',
  TOOL_UPDATED: 'tool.updated',
  EXECUTION_REQUESTED: 'tool.execution.requested',
  EXECUTION_STARTED: 'tool.execution.started',
  EXECUTION_COMPLETED: 'tool.execution.completed',
  EXECUTION_FAILED: 'tool.execution.failed',
  EXECUTION_TIMEOUT: 'tool.execution.timeout',
  EXECUTION_CANCELLED: 'tool.execution.cancelled',
  APPROVAL_REQUESTED: 'tool.approval.requested',
  APPROVAL_APPROVED: 'tool.approval.approved',
  APPROVAL_REJECTED: 'tool.approval.rejected',
  APPROVAL_EXPIRED: 'tool.approval.expired',
  DAG_STARTED: 'tool.dag.started',
  DAG_COMPLETED: 'tool.dag.completed',
  DAG_FAILED: 'tool.dag.failed',
  DAG_NODE_COMPLETED: 'tool.dag.node.completed',
  INTENT_CLASSIFIED: 'tool.intent.classified',
  TOOL_SIMULATED: 'tool.simulated',
  TOOL_REPLAYED: 'tool.replayed',
  HEALTH_CHANGED: 'tool.health.changed',
  CIRCUIT_OPENED: 'tool.circuit.opened',
  CIRCUIT_CLOSED: 'tool.circuit.closed',
  RATE_LIMITED: 'tool.rate.limited',
} as const

export const TOOL_RUNTIME_DEFAULTS = {
  CIRCUIT_BREAKER: {
    failureThreshold: 5,        // Consecutive failures before opening
    resetTimeoutMs: 60_000,     // 1 minute before half-open
    halfOpenMaxTests: 2,        // Test requests in half-open state
  },
  RATE_LIMIT: {
    defaultMax: 60,
    defaultWindow: 60,
    burstMax: 10,
    burstWindow: 1,
  },
  COOLDOWN: {
    defaultMs: 0,
    safeMs: 0,
    moderateMs: 5_000,
    highRiskMs: 30_000,
    criticalMs: 120_000,
  },
  EXECUTION: {
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 300_000,
    maxRetries: 3,
    retryBackoffMs: 2_000,
  },
  APPROVAL: {
    defaultExpiryMs: 24 * 3600_000,  // 24 hours
    maxEscalationLevel: 3,
    reminderIntervalMs: 4 * 3600_000, // 4 hours
  },
  HEALTH: {
    monitoringWindowMs: 24 * 3600_000,
    minSampleSize: 5,
    degradedThreshold: 0.7,       // success rate below this = degraded
    unhealthyThreshold: 0.4,      // success rate below this = unhealthy
  },
} as const
