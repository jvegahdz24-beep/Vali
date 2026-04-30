// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — GET /api/calendar/auth-url
// Returns the Google OAuth2 consent URL for the given workspace.
// Requires an active session + workspace membership.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { getAuthUrl } from '@/lib/calendar/google-calendar'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return Response.json({ error: 'workspaceId es requerido' }, { status: 400 })
    }

    // Verify caller has access to this workspace via session payload
    // (requireWorkspace queries DB; use payload.workspaceId for fast check)
    const { requireWorkspace } = await import('@/lib/api-auth')
    await requireWorkspace(workspaceId, session.userId)

    const url = getAuthUrl(workspaceId)

    return Response.json({ url })
  } catch (error) {
    return errorResponse(error)
  }
}
