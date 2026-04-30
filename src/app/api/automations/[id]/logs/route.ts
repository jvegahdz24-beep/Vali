// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automation Logs API
// GET /api/automations/[id]/logs — Get execution logs for an automation
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Verify automation exists
    const automation = await db.automation.findUnique({ where: { id } })
    if (!automation) {
      return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    await requireWorkspace(automation.workspaceId, session.userId)

    const [logs, total] = await Promise.all([
      db.automationLog.findMany({
        where: { automationId: id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      db.automationLog.count({ where: { automationId: id } }),
    ])

    return Response.json({
      success: true,
      logs,
      total,
      automationName: automation.name,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json()
    const { status, action, message, contactId, contactName, metadata } = body

    const automation = await db.automation.findUnique({ where: { id } })
    if (!automation) {
      return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    await requireWorkspace(automation.workspaceId, session.userId)

    const log = await db.automationLog.create({
      data: {
        automationId: id,
        workspaceId: automation.workspaceId,
        status: status || 'success',
        action: action || null,
        message: message || null,
        contactId: contactId || null,
        contactName: contactName || null,
        metadata: metadata ? JSON.stringify(metadata) : '{}',
      },
    })

    // Update run count and last run time on the automation
    await db.automation.update({
      where: { id },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
      },
    })

    return Response.json({ success: true, log }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
