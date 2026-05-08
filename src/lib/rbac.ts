// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Role-Based Access Control (RBAC)
// Enforces workspace-level role permissions on API routes
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { ApiError } from '@/lib/api-auth'
import type { SessionPayload } from '@/lib/auth-edge'

// ─── Role Definitions ──────────────────────────────────────────

/**
 * Workspace roles in descending order of privilege.
 * Higher index = more permissions.
 */
export const WORKSPACE_ROLES = ['viewer', 'member', 'admin', 'owner'] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

/**
 * Role hierarchy levels — used for permission comparisons.
 * owner (3) > admin (2) > member (1) > viewer (0)
 */
const ROLE_LEVELS: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
}

// ─── Permission Helpers ────────────────────────────────────────

/**
 * Check if a role has at least the minimum required level.
 * Returns true if the user's role level >= the minimum level.
 */
function hasMinimumRole(userRole: string, minimumRole: WorkspaceRole): boolean {
  const userLevel = ROLE_LEVELS[userRole as WorkspaceRole]
  const requiredLevel = ROLE_LEVELS[minimumRole]
  return userLevel >= requiredLevel
}

/**
 * Check if a user's role is one of the allowed roles.
 */
function hasAnyRole(userRole: string, allowedRoles: WorkspaceRole[]): boolean {
  return allowedRoles.includes(userRole as WorkspaceRole)
}

// ─── Public RBAC Functions ─────────────────────────────────────

/**
 * requireRole — Enforces workspace-level role permissions.
 *
 * Verifies that the authenticated user is a member of the workspace
 * AND has one of the allowed roles. Throws ApiError (403) if not.
 *
 * @param session - The verified JWT session payload
 * @param workspaceId - The workspace to check membership/role in
 * @param allowedRoles - Array of roles that are permitted to perform this action
 * @returns The WorkspaceMember record (useful for downstream logic)
 * @throws ApiError(400) if workspaceId is missing
 * @throws ApiError(403) if user is not a member or role is insufficient
 *
 * Usage:
 *   const session = await requireAuth(req)
 *   const member = await requireRole(session, workspaceId, ['owner', 'admin'])
 */
export async function requireRole(
  session: SessionPayload,
  workspaceId: string,
  allowedRoles: WorkspaceRole[]
) {
  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId es requerido')
  }

  const member = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: session.userId,
        workspaceId,
      },
    },
  })

  if (!member) {
    throw new ApiError(403, 'No tienes acceso a este workspace')
  }

  if (!hasAnyRole(member.role, allowedRoles)) {
    throw new ApiError(
      403,
      `No tienes permisos suficientes. Se requiere uno de: ${allowedRoles.join(', ')}. Tu rol actual: ${member.role}.`
    )
  }

  return member
}

/**
 * requireMinimumRole — Check if user has at least the specified minimum role level.
 *
 * Simpler alternative when you want "at least X role" instead of an explicit list.
 * E.g., `requireMinimumRole(session, workspaceId, 'admin')` allows admin + owner.
 *
 * @param session - The verified JWT session payload
 * @param workspaceId - The workspace to check
 * @param minimumRole - The minimum role required (inclusive)
 * @returns The WorkspaceMember record
 */
export async function requireMinimumRole(
  session: SessionPayload,
  workspaceId: string,
  minimumRole: WorkspaceRole
) {
  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId es requerido')
  }

  const member = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: session.userId,
        workspaceId,
      },
    },
  })

  if (!member) {
    throw new ApiError(403, 'No tienes acceso a este workspace')
  }

  if (!hasMinimumRole(member.role, minimumRole)) {
    throw new ApiError(
      403,
      `No tienes permisos suficientes. Se requiere rol mínimo: ${minimumRole}. Tu rol actual: ${member.role}.`
    )
  }

  return member
}

/**
 * Convenience presets for common permission checks.
 * These wrap requireRole with pre-configured allowed role lists.
 */
export const rbac = {
  /**
   * Owner and admin only — used for billing, workspace settings, dangerous operations.
   */
  ownerOrAdmin: (session: SessionPayload, workspaceId: string) =>
    requireRole(session, workspaceId, ['owner', 'admin']),

  /**
   * Any workspace member can access — owner, admin, or member.
   * Viewers are excluded (read-only access).
   */
  canWrite: (session: SessionPayload, workspaceId: string) =>
    requireRole(session, workspaceId, ['owner', 'admin', 'member']),

  /**
   * All roles including viewers — used for read/list operations.
   */
  canRead: (session: SessionPayload, workspaceId: string) =>
    requireRole(session, workspaceId, ['owner', 'admin', 'member', 'viewer']),

  /**
   * Owner only — the most restrictive, for critical operations like workspace deletion.
   */
  ownerOnly: (session: SessionPayload, workspaceId: string) =>
    requireRole(session, workspaceId, ['owner']),
}
