// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automation Run API
// POST /api/automations/[id]/run — Manually trigger an automation
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req)
    const { id } = await params

    const automation = await db.automation.findUnique({
      where: { id },
    })

    if (!automation) {
      return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    // Update last run time and increment run count
    const updated = await db.automation.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
      },
    })

    return Response.json({
      success: true,
      message: `Automatización "${automation.name}" ejecutada`,
      runCount: updated.runCount,
      lastRunAt: updated.lastRunAt,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
