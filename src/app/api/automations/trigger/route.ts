// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Manual Automation Trigger
// POST /api/automations/trigger
//
// Body: { automationId, contactId, context? }
// Executes a single automation immediately (any triggerType).
// Creates an AutomationLog record on success/failure.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { executeAutomationActions } from '@/lib/automations/executor'

interface TriggerBody {
  automationId: string
  contactId?: string
  context?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body: TriggerBody = await req.json()
    const { automationId, contactId, context } = body

    if (!automationId) {
      return Response.json({ error: 'automationId is required' }, { status: 400 })
    }

    // ─── Load automation ────────────────────────────────────
    const automation = await db.automation.findUnique({
      where: { id: automationId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        actions: true,
        isActive: true,
        triggerType: true,
      },
    })

    if (!automation) {
      return Response.json({ error: 'Automation not found' }, { status: 404 })
    }

    await requireWorkspace(automation.workspaceId, session.userId)

    if (!automation.isActive) {
      return Response.json({ error: 'Automation is not active' }, { status: 400 })
    }

    // ─── Load contact if provided ───────────────────────────
    let contact: { id: string; firstName: string; lastName: string | null; phone: string | null } | null = null
    if (contactId) {
      contact = await db.contact.findFirst({
        where: { id: contactId, workspaceId: automation.workspaceId },
        select: { id: true, firstName: true, lastName: true, phone: true },
      })
      if (!contact) {
        return Response.json({ error: 'Contact not found in this workspace' }, { status: 404 })
      }
    }

    // ─── Parse + execute actions ────────────────────────────
    let actions: Array<{ type: string; payload?: Record<string, unknown>; config?: Record<string, unknown> }> = []
    try {
      const parsed = JSON.parse(automation.actions || '[]')
      actions = Array.isArray(parsed) ? parsed : []
    } catch {
      actions = []
    }

    const { executedActions, errors } = await executeAutomationActions({
      automationId,
      workspaceId: automation.workspaceId,
      actions,
      contact,
      context,
    })

    // ─── Create log + update runCount ───────────────────────
    await db.$transaction([
      db.automationLog.create({
        data: {
          automationId,
          workspaceId: automation.workspaceId,
          status: errors.length === 0 ? 'success' : executedActions.length > 0 ? 'partial' : 'failed',
          action: executedActions.join('; ') || null,
          message: errors.length > 0 ? errors.join('; ') : null,
          contactId: contact?.id ?? null,
          contactName: contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : null,
          metadata: JSON.stringify({ context, triggeredBy: 'manual', userId: session.userId }),
        },
      }),
      db.automation.update({
        where: { id: automationId },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      }),
    ])

    return Response.json({
      success: errors.length === 0,
      automationName: automation.name,
      executedActions,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: errors.length > 0 && executedActions.length === 0 ? 502 : 200 })
  } catch (error) {
    return errorResponse(error)
  }
}
