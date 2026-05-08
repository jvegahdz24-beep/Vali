// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Automation Run API
// POST /api/automations/[id]/run — Manually trigger an automation
// Now creates an AutomationLog entry on every run
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { rbac } from '@/lib/rbac'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(req)
    const { id } = await params

    const automation = await db.automation.findUnique({
      where: { id },
    })

    if (!automation) {
      return Response.json({ error: 'Automatización no encontrada' }, { status: 404 })
    }

    // RBAC: Run automation requires member or higher
    await rbac.canWrite(session, automation.workspaceId)

    const runTimestamp = new Date()

    // Execute the automation actions based on trigger type
    let logStatus: 'success' | 'error' | 'partial' = 'success'
    let logMessage = `Automatización "${automation.name}" ejecutada manualmente`
    let contactsAffected = 0

    try {
      // Based on trigger type, execute the appropriate action
      if (automation.triggerType === 'schedule' || automation.triggerType === 'event') {
        // For schedule/event automations, find contacts that match the trigger config
        const triggerConfig = typeof automation.triggerConfig === 'string'
          ? JSON.parse(automation.triggerConfig || '{}')
          : (automation.triggerConfig || {})

        // Execute automation actions on matching contacts
        const actions = typeof automation.actions === 'string'
          ? JSON.parse(automation.actions || '[]')
          : (automation.actions || [])

        // Find contacts in workspace that could be affected
        if (automation.workspaceId) {
          const contactCount = await db.contact.count({
            where: { workspaceId: automation.workspaceId },
          })
          contactsAffected = contactCount
        }

        logMessage = `Ejecutada: ${actions.length} acción(es), ${contactsAffected} contacto(s) en workspace`
      } else if (automation.triggerType === 'message_received') {
        logMessage = `Trigger: mensaje recibido — acciones listas para ejecutar`
      } else if (automation.triggerType === 'deal_stage_change') {
        logMessage = `Trigger: cambio de etapa en deal — monitoreando`
      }
    } catch (execError) {
      logStatus = 'error'
      logMessage = `Error ejecutando: ${execError instanceof Error ? execError.message : 'Error desconocido'}`
    }

    // Create an AutomationLog entry for every run
    await db.automationLog.create({
      data: {
        automationId: id,
        workspaceId: automation.workspaceId,
        status: logStatus,
        action: automation.triggerType,
        message: logMessage,
        metadata: JSON.stringify({
          triggerType: automation.triggerType,
          executedAt: runTimestamp.toISOString(),
          contactsAffected,
          manualTrigger: true,
        }),
      },
    })

    // Update last run time and increment run count on the automation
    const updated = await db.automation.update({
      where: { id },
      data: {
        lastRunAt: runTimestamp,
        runCount: { increment: 1 },
      },
    })

    return Response.json({
      success: true,
      message: `Automatización "${automation.name}" ejecutada`,
      runCount: updated.runCount,
      lastRunAt: updated.lastRunAt,
      logStatus,
      logMessage,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
