// ═══════════════════════════════════════════════════════════════
// POST /api/marketing/publish — publica un auto en redes (Meta).
// Body: { workspaceId, carId, networks, formats, templates?, caption?, videoUrl? }
// RBAC: crm.write. Lógica en lib/marketing/publish.ts.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { publishCar } from '@/lib/marketing/publish'
import { summarizePublishResults } from '@/lib/marketing/publish-results'

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as Parameters<typeof publishCar>[0]
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!body.carId) throw new ApiError(400, 'Falta el auto')

    const { results } = await publishCar({ ...body, base: baseUrl(req), source: 'manual' })
    const summary = summarizePublishResults(results)

    return Response.json({
      success: summary.status === 'published',
      published: summary.published > 0,
      publishedCount: summary.published,
      failedCount: summary.failed,
      requestedCount: summary.requested,
      status: summary.status,
      results,
      ...(summary.error ? { error: summary.error } : {}),
    }, { status: summary.status === 'failed' ? 502 : 200 })
  } catch (error) { return errorResponse(error) }
}
