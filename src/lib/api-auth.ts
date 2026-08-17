// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — API Route Protection Helpers
// Use these in all API routes to require authentication & workspace access
// ═══════════════════════════════════════════════════════════════

import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { PLANS } from '@/lib/constants'
import type { PlanLimits } from '@/lib/types'
import { hasCapability, type Capability } from '@/lib/rbac'

/**
 * Get the current authenticated user from the JWT session cookie.
 * Throws a 401 error if no valid session exists.
 *
 * Usage:
 *   const session = await requireAuth(request)
 *   const userId = session.userId
 */
export async function requireAuth(request: NextRequest) {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!sessionToken) {
    throw new ApiError(401, 'No autenticado. Inicia sesión para continuar.')
  }

  const payload = await verifySessionToken(sessionToken)

  if (!payload) {
    throw new ApiError(401, 'Sesión inválida o expirada. Inicia sesión de nuevo.')
  }

  return payload
}

/**
 * Verify that the authenticated user is a member of the specified workspace.
 * Throws a 403 error if the user does not have access.
 * Throws a 402 error if the workspace is suspended (payment failure).
 *
 * Pass `allowSuspended: true` for billing/portal routes where suspended
 * tenants still need access to update their payment method.
 *
 * Usage:
 *   const payload = await requireAuth(request)
 *   await requireWorkspace(workspaceId, payload.userId)
 */
export async function requireWorkspace(
  workspaceId: string,
  userId: string,
  options?: { allowSuspended?: boolean },
) {
  if (!workspaceId) {
    throw new ApiError(400, 'workspaceId es requerido')
  }

  const member = await db.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    include: {
      workspace: {
        select: { isActive: true },
      },
    },
  })

  if (!member) {
    throw new ApiError(403, 'No tienes acceso a este workspace')
  }

  if (!options?.allowSuspended && member.workspace?.isActive === false) {
    throw new ApiError(
      402,
      'Tu cuenta está suspendida por un problema de pago. Actualiza tu método de pago para reactivarla.',
      'ACCOUNT_SUSPENDED',
    )
  }

  return member
}

/**
 * Enforce that a workspace member's role has the given capability.
 * Throws a 403 ApiError otherwise. Pass the role from the member returned by
 * `requireWorkspace`.
 *
 * Usage:
 *   const member = await requireWorkspace(workspaceId, session.userId)
 *   requirePermission(member.role, 'team.manage')
 */
export function requirePermission(role: string | null | undefined, cap: Capability) {
  if (!hasCapability(role, cap)) {
    throw new ApiError(403, 'No tienes permisos para realizar esta acción.', 'FORBIDDEN')
  }
}

/**
 * Custom API error class for consistent error responses.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code || 'ERROR',
      statusCode: this.statusCode,
    }
  }
}

/**
 * Extract client IP from request headers.
 * Works behind proxies (X-Forwarded-For, X-Real-IP).
 */
export function getClientIp(request: NextRequest): string {
  const xForwardedFor = request.headers.get('x-forwarded-for')
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim()
  }

  const xRealIp = request.headers.get('x-real-ip')
  if (xRealIp) {
    return xRealIp.trim()
  }

  return 'unknown'
}

/**
 * Helper to create a consistent error response.
 */
export function errorResponse(error: unknown, fallbackMessage = 'Error interno del servidor') {
  if (error instanceof ApiError) {
    return Response.json(error.toJSON(), { status: error.statusCode })
  }

  const errMsg = error instanceof Error ? error.message : String(error)
  console.error('[API Error]', errMsg, error)

  return Response.json(
    { error: fallbackMessage, code: 'INTERNAL_ERROR' },
    { status: 500 }
  )
}

// ─── Plan Limits ──────────────────────────────────────────────

/**
 * Get the effective plan limits for a workspace.
 * Returns the plan limits from PLANS constants.
 * Use this before resource creation to enforce subscription limits.
 *
 * Usage:
 *   const { limits, planName } = await getPlanLimits(workspaceId)
 *   if (limits.maxContacts !== -1 && count >= limits.maxContacts) { ... }
 */
export async function getPlanLimits(workspaceId: string): Promise<{
  limits: PlanLimits
  planName: string
  workspace: { id: string; name: string; plan: string }
}> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, plan: true },
  })

  if (!workspace) {
    throw new ApiError(404, 'Workspace no encontrado')
  }

  const planDef = PLANS[workspace.plan] ?? PLANS['free']
  return {
    limits: planDef.limits,
    planName: workspace.plan,
    workspace,
  }
}

/**
 * Count AI-generated messages sent this calendar month for a workspace.
 */
/**
 * Inicio de la ventana MENSUAL de consumo de mensajes IA, anclada a la fecha de
 * renovación del plan del workspace (subscription.currentPeriodStart). Así el
 * límite se reinicia cada mes en el "aniversario" del plan de cada usuario
 * (ej. si contrató el día 15, se reinicia cada día 15) — no el día 1 del
 * calendario. Sin suscripción activa (free/trial) cae al día 1 del mes.
 */
export async function aiUsageWindowStart(workspaceId: string): Promise<Date> {
  const now = new Date()
  let anchorDay = 1
  try {
    const sub = await db.subscription.findUnique({
      where: { workspaceId },
      select: { currentPeriodStart: true, status: true },
    })
    if (sub?.currentPeriodStart && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      anchorDay = new Date(sub.currentPeriodStart).getDate() // 1..31
    }
  } catch { /* fallback: día 1 del calendario */ }
  // Día válido dentro de un mes dado (maneja meses cortos: 31 → 28/30)
  const clampDay = (y: number, m: number, d: number) => Math.min(d, new Date(y, m + 1, 0).getDate())
  let y = now.getFullYear(), m = now.getMonth()
  let start = new Date(y, m, clampDay(y, m, anchorDay), 0, 0, 0, 0)
  if (start > now) { // el aniversario de este mes aún no llega → tomar el del mes anterior
    m -= 1; if (m < 0) { m = 11; y -= 1 }
    start = new Date(y, m, clampDay(y, m, anchorDay), 0, 0, 0, 0)
  }
  return start
}

export async function countAiMessagesThisMonth(workspaceId: string): Promise<number> {
  const windowStart = await aiUsageWindowStart(workspaceId)
  return db.message.count({
    where: {
      conversation: { workspaceId },
      isAiGenerated: true,
      createdAt: { gte: windowStart },
    },
  })
}
