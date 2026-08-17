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
    let actions: Array<{ type: string; payload?: Record<string, unknown> }> = []
    try {
      actions = JSON.parse(automation.actions || '[]')
    } catch {
      actions = []
    }

    const executedActions: string[] = []
    const errors: string[] = []

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'send_message': {
            // Queue or send message to contact via conversation
            if (contact) {
              const messageText = (action.payload?.message as string) ||
                (action.payload?.content as string) || ''
              if (messageText && contact.phone) {
                // Find or create conversation
                const conv = await db.conversation.findFirst({
                  where: {
                    workspaceId: automation.workspaceId,
                    contactId: contact.id,
                    status: 'active',
                  },
                  select: { id: true },
                })
                if (conv) {
                  await db.message.create({
                    data: {
                      conversationId: conv.id,
                      content: messageText,
                      senderType: 'agent',
                      isAiGenerated: false,
                      metadata: JSON.stringify({ source: 'automation', automationId }),
                    },
                  })
                  executedActions.push(`send_message: "${messageText.slice(0, 50)}"`)
                } else {
                  errors.push('send_message: no active conversation for contact')
                }
              }
            }
            break
          }

          case 'update_contact': {
            if (contact && action.payload) {
              const allowed = ['leadScore', 'tags', 'assignedTo', 'stage']
              const updateData: Record<string, unknown> = {}
              for (const k of allowed) {
                if (k in action.payload) updateData[k] = action.payload[k]
              }
              if (Object.keys(updateData).length > 0) {
                await db.contact.update({
                  where: { id: contact.id },
                  data: updateData as Parameters<typeof db.contact.update>[0]['data'],
                })
                executedActions.push(`update_contact: ${Object.keys(updateData).join(', ')}`)
              }
            }
            break
          }

          case 'add_tag': {
            if (contact) {
              const existing = await db.contact.findUnique({
                where: { id: contact.id },
                select: { tags: true },
              })
              const currentTags: string[] = JSON.parse(existing?.tags || '[]')
              const tag = action.payload?.tag as string
              if (tag && !currentTags.includes(tag)) {
                await db.contact.update({
                  where: { id: contact.id },
                  data: { tags: JSON.stringify([...currentTags, tag]) },
                })
                executedActions.push(`add_tag: "${tag}"`)
              }
            }
            break
          }

          case 'webhook': {
            const url = action.payload?.url as string
            if (url && url.startsWith('https://')) {
              // Fire-and-forget webhook
              fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  automationId,
                  contactId: contact?.id,
                  context,
                  triggeredAt: new Date().toISOString(),
                }),
                signal: AbortSignal.timeout(5000),
              }).catch((e) => console.error('[Automation webhook]', e))
              executedActions.push(`webhook: ${url}`)
            }
            break
          }

          default:
            executedActions.push(`skipped: unknown action type "${action.type}"`)
        }
      } catch (actionErr) {
        const msg = actionErr instanceof Error ? actionErr.message : String(actionErr)
        errors.push(`${action.type}: ${msg}`)
      }
    }

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
      success: true,
      automationName: automation.name,
      executedActions,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
