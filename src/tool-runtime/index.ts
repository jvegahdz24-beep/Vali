// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 3: TOOL OS Runtime
// Public API — Barrel exports for the entire Tool Runtime system
//
// Usage:
//   import { executeTool, dryRunTool, classifyIntent } from '@/tool-runtime'
//
//   const result = await executeTool({
//     workspaceId: 'ws_123',
//     contractId: 'cl_contract_abc',
//     input: { contactId: 'c_456', message: 'Hello!' },
//   })
// ═══════════════════════════════════════════════════════════════

// ─── Core Pipeline ─────────────────────────────────────────
export { ExecutionPipeline } from './execution-pipeline'

// ─── Tool Registry ─────────────────────────────────────────
export { ToolRegistry } from './tool-registry'

// ─── Intent Classifier ─────────────────────────────────────
export { IntentClassifier } from './intent-classifier'

// ─── Approval Engine ───────────────────────────────────────
export { ApprovalEngine } from './approval-engine'
export type { ApprovalStats } from './approval-engine'

// ─── Health Monitor ────────────────────────────────────────
export { ToolHealthMonitor } from './health-monitor'

// ─── Types & Constants ─────────────────────────────────────
export type {
  RiskLevel,
  ExecutionStatus,
  ApprovalStatus,
  ReplayMode,
  DAGStatus,
  DAGNodeStatus,
  ToolDefinition,
  ExecutionRequest,
  ExecutionResult,
  ApprovalRequest,
  ApprovalResolution,
  IntentClassification,
  DAGDefinition,
  DAGNodeDefinition,
  ToolHealthStatus,
  RateLimitResult,
  CooldownResult,
} from './types'

export {
  TOOL_RUNTIME_EVENTS,
  TOOL_RUNTIME_DEFAULTS,
} from './types'

// ─── Convenience Functions ─────────────────────────────────

import { ExecutionPipeline } from './execution-pipeline'
import type { ExecutionRequest, ExecutionResult } from './types'
import { IntentClassifier } from './intent-classifier'
import type { IntentClassification } from './types'

/**
 * Execute a tool through the full pipeline.
 * This is the PRIMARY entry point for tool execution.
 *
 * Pipeline stages:
 *   Resolve → Validate → Rate Limit → Cooldown →
 *   Health Check → Permission → Cognitive Gate →
 *   Approval (if required) → Execute → Audit
 */
export async function executeTool(
  request: ExecutionRequest,
): Promise<ExecutionResult> {
  return ExecutionPipeline.execute(request)
}

/**
 * Execute a tool after approval has been granted.
 */
export async function executeAfterApproval(
  executionId: string,
): Promise<ExecutionResult> {
  return ExecutionPipeline.executeAfterApproval(executionId)
}

/**
 * Simulate a tool execution without side effects.
 */
export async function dryRunTool(
  request: ExecutionRequest,
): Promise<ExecutionResult> {
  return ExecutionPipeline.dryRun(request)
}

/**
 * Replay a past execution.
 */
export async function replayTool(
  executionId: string,
  mode?: 'debug' | 're_execute' | 'dry_run' | 'compare',
): Promise<ExecutionResult> {
  return ExecutionPipeline.replay(executionId, mode)
}

/**
 * Classify raw input into an intent and map to a tool.
 */
export async function classifyIntent(
  workspaceId: string,
  rawInput: string,
  context?: {
    sessionId?: string
    contactId?: string
    agentId?: string
    correlationId?: string
  },
): Promise<IntentClassification> {
  return IntentClassifier.classify(workspaceId, rawInput, context)
}
