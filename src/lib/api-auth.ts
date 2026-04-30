// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — API Route Protection Helpers
// Use these in all API routes to require authentication & workspace access
// ═══════════════════════════════════════════════════════════════

import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

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
 *
 * Usage:
 *   const payload = await requireAuth(request)
 *   await requireWorkspace(workspaceId, payload.userId)
 */
export async function requireWorkspace(workspaceId: string, userId: string) {
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
  })

  if (!member) {
    throw new ApiError(403, 'No tienes acceso a este workspace')
  }

  return member
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
    { error: fallbackMessage, code: 'INTERNAL_ERROR', details: errMsg },
    { status: 500 }
  )
}
