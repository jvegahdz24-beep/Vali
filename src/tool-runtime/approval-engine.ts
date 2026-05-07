// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — FASE 3: TOOL OS Runtime
// Approval Engine — Human-in-the-loop approval workflows
//
// Architecture:
//   1. Create approval request for HIGH_RISK/CRITICAL tools
//   2. Poll or subscribe for resolution (approve/reject)
//   3. Auto-expire stale requests
//   4. Escalate beyond threshold
//   5. Emit events on every state transition
//
// Uses BullMQ for reminder scheduling and expiration.
// Uses Prisma for persistent state.
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logOk, logError, logWarn, safeJsonParse } from '@/lib/logger'
import { eventBus } from '@/lib/event-bus'
import { QUEUE_NAMES, scheduleJob } from '@/lib/queue'
import type { ApprovalRequest, ApprovalResolution, ApprovalStatus, RiskLevel } from './types'
import { TOOL_RUNTIME_EVENTS, TOOL_RUNTIME_DEFAULTS } from './types'

const TAG = 'APPROVAL_ENGINE'

// ─── Approval Stats ────────────────────────────────────────

export interface ApprovalStats {
  pending: number
  approved: number
  rejected: number
  expired: number
  avgResolutionTimeMs: number | null
  pendingByRiskLevel: Record<string, number>
}

// ═══════════════════════════════════════════════════════════════
// ApprovalEngine
// ═══════════════════════════════════════════════════════════════

export class ApprovalEngine {

  // ─────────────────────────────────────────────────────────
  // 1. CREATE REQUEST — Create a new approval request
  // Called when a tool execution requires human approval.
  // ─────────────────────────────────────────────────────────

  static async createRequest(request: ApprovalRequest): Promise<{
    approvalId: string
    status: ApprovalStatus
    expiresAt: Date
  }> {
    logInfo(TAG, 'create_request', {
      workspaceId: request.workspaceId,
      contractId: request.contractId,
      riskLevel: request.riskLevel,
    })

    try {
      const now = new Date()
      const expiresAt = request.expiresAt ?? new Date(
        now.getTime() + TOOL_RUNTIME_DEFAULTS.APPROVAL.defaultExpiryMs,
      )

      const approval = await db.approvalFlow.create({
        data: {
          workspaceId: request.workspaceId,
          contractId: request.contractId,
          executionId: request.executionId,
          requestReason: JSON.stringify({
            reason: request.reason,
            context: request.context ?? {},
            estimatedImpact: request.riskLevel,
          }),
          riskLevel: request.riskLevel,
          status: 'pending',
          requestedAt: now,
          expiresAt,
          // Set escalation target if we know who to escalate to
          escalatedTo: request.requestedBy ? undefined : undefined,
        },
      })

      // Schedule expiration job
      scheduleJob(QUEUE_NAMES.NOTIFICATIONS, {
        type: 'approval_expiration',
        approvalId: approval.id,
        workspaceId: request.workspaceId,
      }, expiresAt)

      // Schedule first reminder
      const reminderAt = new Date(
        now.getTime() + TOOL_RUNTIME_DEFAULTS.APPROVAL.reminderIntervalMs,
      )
      scheduleJob(QUEUE_NAMES.NOTIFICATIONS, {
        type: 'approval_reminder',
        approvalId: approval.id,
        workspaceId: request.workspaceId,
        reminderNumber: 1,
      }, reminderAt)

      // Emit event
      eventBus.emit(TOOL_RUNTIME_EVENTS.APPROVAL_REQUESTED, {
        workspaceId: request.workspaceId,
        contractId: request.contractId,
        approvalId: approval.id,
        riskLevel: request.riskLevel,
        expiresAt: expiresAt.toISOString(),
        reason: request.reason,
      }, 'tool-runtime')

      logOk(TAG, 'request_created', {
        approvalId: approval.id,
        expiresAt: expiresAt.toISOString(),
      })

      return {
        approvalId: approval.id,
        status: 'pending',
        expiresAt,
      }
    } catch (err) {
      logError(TAG, 'create_request_error', err, { workspaceId: request.workspaceId })
      throw new Error(`Failed to create approval request: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. RESOLVE — Approve or reject a pending request
  // ─────────────────────────────────────────────────────────

  static async resolve(
    approvalId: string,
    resolution: ApprovalResolution,
  ): Promise<{
    success: boolean
    status: ApprovalStatus
    message: string
  }> {
    logInfo(TAG, 'resolve_request', {
      approvalId,
      approved: resolution.approved,
      resolvedBy: resolution.resolvedBy,
    })

    try {
      // Fetch current approval
      const approval = await db.approvalFlow.findUnique({
        where: { id: approvalId },
      })

      if (!approval) {
        return { success: false, status: 'pending', message: 'Approval not found' }
      }

      if (approval.status !== 'pending') {
        return {
          success: false,
          status: approval.status as ApprovalStatus,
          message: `Approval already ${approval.status}`,
        }
      }

      // Check expiration
      if (approval.expiresAt && approval.expiresAt < new Date()) {
        await db.approvalFlow.update({
          where: { id: approvalId },
          data: { status: 'expired' },
        })
        eventBus.emit(TOOL_RUNTIME_EVENTS.APPROVAL_EXPIRED, {
          workspaceId: approval.workspaceId,
          approvalId,
          contractId: approval.contractId,
        }, 'tool-runtime')

        return { success: false, status: 'expired', message: 'Approval has expired' }
      }

      // Update status
      const newStatus = resolution.approved ? 'approved' : 'rejected'

      await db.approvalFlow.update({
        where: { id: approvalId },
        data: {
          status: newStatus,
          resolvedAt: new Date(),
          resolvedBy: resolution.resolvedBy,
          resolutionNote: resolution.note ?? null,
        },
      })

      // Emit appropriate event
      const eventType = resolution.approved
        ? TOOL_RUNTIME_EVENTS.APPROVAL_APPROVED
        : TOOL_RUNTIME_EVENTS.APPROVAL_REJECTED

      eventBus.emit(eventType, {
        workspaceId: approval.workspaceId,
        approvalId,
        contractId: approval.contractId,
        executionId: approval.executionId,
        resolvedBy: resolution.resolvedBy,
        note: resolution.note,
      }, 'tool-runtime')

      logOk(TAG, 'request_resolved', {
        approvalId,
        status: newStatus,
        resolvedBy: resolution.resolvedBy,
      })

      return {
        success: true,
        status: newStatus,
        message: resolution.approved ? 'Tool execution approved' : 'Tool execution rejected',
      }
    } catch (err) {
      logError(TAG, 'resolve_error', err, { approvalId })
      return { success: false, status: 'pending', message: 'Error resolving approval' }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 3. CHECK STATUS — Get the current status of an approval
  // ─────────────────────────────────────────────────────────

  static async checkStatus(
    approvalId: string,
  ): Promise<{
    status: ApprovalStatus
    riskLevel: string
    requestedAt: Date
    resolvedAt: Date | null
    expiresAt: Date | null
    resolvedBy: string | null
    resolutionNote: string | null
  } | null> {
    try {
      const approval = await db.approvalFlow.findUnique({
        where: { id: approvalId },
        select: {
          status: true,
          riskLevel: true,
          requestedAt: true,
          resolvedAt: true,
          expiresAt: true,
          resolvedBy: true,
          resolutionNote: true,
        },
      })

      if (!approval) return null

      return {
        status: approval.status as ApprovalStatus,
        riskLevel: approval.riskLevel,
        requestedAt: approval.requestedAt,
        resolvedAt: approval.resolvedAt,
        expiresAt: approval.expiresAt,
        resolvedBy: approval.resolvedBy,
        resolutionNote: approval.resolutionNote,
      }
    } catch (err) {
      logError(TAG, 'check_status_error', err, { approvalId })
      return null
    }
  }

  // ─────────────────────────────────────────────────────────
  // 4. HANDLE EXPIRATION — Called by scheduled job
  // Marks expired approvals and emits events
  // ─────────────────────────────────────────────────────────

  static async handleExpiration(approvalId: string): Promise<void> {
    try {
      const approval = await db.approvalFlow.findUnique({
        where: { id: approvalId },
      })

      if (!approval || approval.status !== 'pending') return

      // Verify it's actually expired (race condition check)
      if (approval.expiresAt && approval.expiresAt >= new Date()) return

      await db.approvalFlow.update({
        where: { id: approvalId },
        data: { status: 'expired' },
      })

      eventBus.emit(TOOL_RUNTIME_EVENTS.APPROVAL_EXPIRED, {
        workspaceId: approval.workspaceId,
        approvalId,
        contractId: approval.contractId,
        executionId: approval.executionId,
      }, 'tool-runtime')

      // If there's a linked execution, mark it as cancelled
      if (approval.executionId) {
        await db.toolExecution.update({
          where: { id: approval.executionId },
          data: { status: 'cancelled', error: 'Approval expired' },
        })
      }

      logWarn(TAG, 'approval_expired', { approvalId, workspaceId: approval.workspaceId })
    } catch (err) {
      logError(TAG, 'expiration_error', err, { approvalId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 5. SEND REMINDER — Called by scheduled job
  // Sends reminder for pending approvals
  // ─────────────────────────────────────────────────────────

  static async sendReminder(
    approvalId: string,
    reminderNumber: number,
  ): Promise<void> {
    try {
      const approval = await db.approvalFlow.findUnique({
        where: { id: approvalId },
      })

      if (!approval || approval.status !== 'pending') return

      logInfo(TAG, 'approval_reminder', {
        approvalId,
        workspaceId: approval.workspaceId,
        reminderNumber,
      })

      // Schedule next reminder if not at max
      const maxReminders = 3
      if (reminderNumber < maxReminders) {
        const nextReminder = new Date(
          Date.now() + TOOL_RUNTIME_DEFAULTS.APPROVAL.reminderIntervalMs,
        )
        scheduleJob(QUEUE_NAMES.NOTIFICATIONS, {
          type: 'approval_reminder',
          approvalId,
          workspaceId: approval.workspaceId,
          reminderNumber: reminderNumber + 1,
        }, nextReminder)
      }
    } catch (err) {
      logError(TAG, 'reminder_error', err, { approvalId })
    }
  }

  // ─────────────────────────────────────────────────────────
  // 6. CANCEL — Cancel a pending approval
  // ─────────────────────────────────────────────────────────

  static async cancel(approvalId: string): Promise<boolean> {
    try {
      const approval = await db.approvalFlow.findUnique({
        where: { id: approvalId },
      })

      if (!approval || approval.status !== 'pending') return false

      await db.approvalFlow.update({
        where: { id: approvalId },
        data: {
          status: 'cancelled',
          resolvedAt: new Date(),
        },
      })

      logOk(TAG, 'approval_cancelled', { approvalId })
      return true
    } catch (err) {
      logError(TAG, 'cancel_error', err, { approvalId })
      return false
    }
  }

  // ─────────────────────────────────────────────────────────
  // 7. ESCALATE — Escalate a pending approval
  // Increases escalation level and sets escalation target
  // ─────────────────────────────────────────────────────────

  static async escalate(
    approvalId: string,
    escalateToUserId: string,
  ): Promise<boolean> {
    try {
      const approval = await db.approvalFlow.findUnique({
        where: { id: approvalId },
      })

      if (!approval || approval.status !== 'pending') return false

      // Check max escalation level
      if (approval.escalationLevel >= TOOL_RUNTIME_DEFAULTS.APPROVAL.maxEscalationLevel) {
        logWarn(TAG, 'max_escalation_reached', { approvalId, level: approval.escalationLevel })
        return false
      }

      await db.approvalFlow.update({
        where: { id: approvalId },
        data: {
          escalationLevel: { increment: 1 },
          escalatedTo: escalateToUserId,
        },
      })

      logOk(TAG, 'approval_escalated', {
        approvalId,
        newLevel: approval.escalationLevel + 1,
        escalatedTo: escalateToUserId,
      })

      return true
    } catch (err) {
      logError(TAG, 'escalate_error', err, { approvalId })
      return false
    }
  }

  // ─────────────────────────────────────────────────────────
  // 8. GET STATS — Approval statistics for a workspace
  // ─────────────────────────────────────────────────────────

  static async getStats(workspaceId: string): Promise<ApprovalStats> {
    try {
      const aggregations = await db.approvalFlow.groupBy({
        by: ['status', 'riskLevel'],
        where: { workspaceId },
        _count: true,
      })

      let pending = 0
      let approved = 0
      let rejected = 0
      let expired = 0
      const pendingByRiskLevel: Record<string, number> = {}

      for (const agg of aggregations) {
        const count = agg._count
        switch (agg.status) {
          case 'pending': pending += count; pendingByRiskLevel[agg.riskLevel] = (pendingByRiskLevel[agg.riskLevel] ?? 0) + count; break
          case 'approved': approved += count; break
          case 'rejected': rejected += count; break
          case 'expired': expired += count; break
        }
      }

      // Calculate average resolution time
      const resolvedApprovals = await db.approvalFlow.findMany({
        where: {
          workspaceId,
          status: { in: ['approved', 'rejected'] },
          resolvedAt: { not: null },
        },
        select: { requestedAt: true, resolvedAt: true },
        take: 100,
        orderBy: { requestedAt: 'desc' },
      })

      let avgResolutionTimeMs: number | null = null
      if (resolvedApprovals.length > 0) {
        const totalMs = resolvedApprovals.reduce((sum, a) => {
          return sum + ((a.resolvedAt?.getTime() ?? 0) - a.requestedAt.getTime())
        }, 0)
        avgResolutionTimeMs = Math.round(totalMs / resolvedApprovals.length)
      }

      return {
        pending,
        approved,
        rejected,
        expired,
        avgResolutionTimeMs,
        pendingByRiskLevel,
      }
    } catch (err) {
      logError(TAG, 'stats_error', err, { workspaceId })
      return {
        pending: 0,
        approved: 0,
        rejected: 0,
        expired: 0,
        avgResolutionTimeMs: null,
        pendingByRiskLevel: {},
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // 9. GET PENDING — Get all pending approvals for a workspace
  // ─────────────────────────────────────────────────────────

  static async getPending(
    workspaceId: string,
    options?: { limit?: number; riskLevel?: RiskLevel },
  ): Promise<Array<{
    id: string
    contractId: string
    riskLevel: string
    reason: string
    requestedAt: Date
    expiresAt: Date | null
    escalationLevel: number
  }>> {
    try {
      const approvals = await db.approvalFlow.findMany({
        where: {
          workspaceId,
          status: 'pending',
          ...(options?.riskLevel && { riskLevel: options.riskLevel }),
        },
        select: {
          id: true,
          contractId: true,
          riskLevel: true,
          requestReason: true,
          requestedAt: true,
          expiresAt: true,
          escalationLevel: true,
        },
        orderBy: { requestedAt: 'asc' },
        take: options?.limit ?? 50,
      })

      return approvals.map((a) => {
        const reason = safeJsonParse(a.requestReason, {}) as Record<string, unknown>
        return {
          id: a.id,
          contractId: a.contractId,
          riskLevel: a.riskLevel,
          reason: (reason.reason as string) ?? 'No reason provided',
          requestedAt: a.requestedAt,
          expiresAt: a.expiresAt,
          escalationLevel: a.escalationLevel,
        }
      })
    } catch (err) {
      logError(TAG, 'get_pending_error', err, { workspaceId })
      return []
    }
  }

  // ─────────────────────────────────────────────────────────
  // 10. CLEANUP EXPIRED — Bulk cleanup of expired approvals
  // Should be called periodically by a cron job
  // ─────────────────────────────────────────────────────────

  static async cleanupExpired(workspaceId?: string): Promise<number> {
    try {
      const result = await db.approvalFlow.updateMany({
        where: {
          status: 'pending',
          expiresAt: { lt: new Date() },
          ...(workspaceId && { workspaceId }),
        },
        data: { status: 'expired' },
      })

      if (result.count > 0) {
        logOk(TAG, 'expired_cleaned', { count: result.count, workspaceId })
      }

      return result.count
    } catch (err) {
      logError(TAG, 'cleanup_error', err, { workspaceId })
      return 0
    }
  }
}

export default ApprovalEngine
