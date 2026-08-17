// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automation Run API
// POST /api/automations/[id]/run — Manually trigger an automation
// Creates one AutomationLog entry per contact execution.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { executeAutomationActions, type AutomationContact } from '@/lib/automations/executor'

interface RunBody {
  contactId?: string
  context?: Record<string, unknown>
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body: RunBody = await req.json().catch(() => ({}))

    // SEC-014: Include workspaceId filter so not-found and forbidden
    // both return 404 — prevents IDOR oracle (existence leak)
    const workspaceId = session.workspaceId
    const automation = await db.automation.findFirst({
      where: workspaceId ? { id, workspaceId } : { id },
    })

    if (!automation) {
      return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }
    await requireWorkspace(automation.workspaceId, session.userId)

    if (!automation.isActive) {
      return Response.json({ error: 'La automatización no está activa' }, { status: 400 })
    }

    let actions: Array<{ type: string; payload?: Record<string, unknown>; config?: Record<string, unknown> }> = []
    try {
      const parsed = JSON.parse(automation.actions || '[]')
      actions = Array.isArray(parsed) ? parsed : []
    } catch {
      actions = []
    }

    let requestedContact: AutomationContact | null = null
    if (body.contactId) {
      requestedContact = await db.contact.findFirst({
        where: { id: body.contactId, workspaceId: automation.workspaceId },
        select: { id: true, firstName: true, lastName: true, phone: true },
      })
      if (!requestedContact) {
        return Response.json({ error: 'Contacto no encontrado en este workspace' }, { status: 404 })
      }
    }

    // Una ejecución manual con contacto explícito solo actúa sobre ese contacto.
    // Para schedule/event, se aplican las acciones a todos los contactos cuando
    // no se especifica contacto.
    const contacts = requestedContact
      ? [requestedContact]
      : automation.triggerType === 'schedule' || automation.triggerType === 'event'
        ? await db.contact.findMany({
            where: { workspaceId: automation.workspaceId },
            select: { id: true, firstName: true, lastName: true, phone: true },
          })
        : [null]

    const runTimestamp = new Date()
    const aggregate = { executedActions: [] as string[], errors: [] as string[] }

    for (const contact of contacts) {
      const result = await executeAutomationActions({
        automationId: id,
        workspaceId: automation.workspaceId,
        actions,
        contact,
        context: body.context,
      })
      aggregate.executedActions.push(...result.executedActions)
      aggregate.errors.push(...result.errors.map((error) => contact ? `${contact.id}: ${error}` : error))

      await db.automationLog.create({
        data: {
          automationId: id,
          workspaceId: automation.workspaceId,
          status: result.errors.length === 0 ? 'success' : result.executedActions.length > 0 ? 'partial' : 'failed',
          action: result.executedActions.join('; ') || null,
          message: result.errors.length > 0 ? result.errors.join('; ') : null,
          contactId: contact?.id ?? null,
          contactName: contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : null,
          metadata: JSON.stringify({
            triggerType: automation.triggerType,
            executedAt: runTimestamp.toISOString(),
            manualTrigger: true,
            context: body.context,
          }),
        },
      })
    }

    const executionCount = contacts.length
    const logStatus = aggregate.errors.length === 0
      ? 'success'
      : aggregate.executedActions.length > 0
        ? 'partial'
        : 'failed'

    const updated = executionCount > 0
      ? await db.automation.update({
          where: { id },
          data: { lastRunAt: runTimestamp, runCount: { increment: executionCount } },
        })
      : automation

    return Response.json({
      success: logStatus === 'success',
      message: `Automatización "${automation.name}" ejecutada`,
      runCount: updated.runCount,
      lastRunAt: updated.lastRunAt,
      logStatus,
      executedActions: aggregate.executedActions,
      errors: aggregate.errors.length > 0 ? aggregate.errors : undefined,
      contactsAffected: contacts.filter(Boolean).length,
    }, { status: logStatus === 'failed' ? 502 : 200 })
  } catch (error) {
    return errorResponse(error)
  }
}
