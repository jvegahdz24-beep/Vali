// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — AI Tool / Function Calling System
// OpenAI-compatible function calling via GLM direct API
// Real implementations — no stubs
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { logInfo, logWarn, logError, logTimer } from '@/lib/logger'
import { generateGLMToken } from './providers'

// ─── Types ────────────────────────────────────────────────────

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: ToolParameter
  properties?: Record<string, ToolParameter>
  required?: string[]
  default?: unknown
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, ToolParameter>
      required?: string[]
    }
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolCallMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

export interface ToolResultMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

export interface ToolCallLog {
  toolName: string
  toolCallId: string
  arguments: Record<string, unknown>
  result: string
  success: boolean
  durationMs: number
  timestamp: string
  workspaceId?: string
  contactId?: string
}

export interface ChatWithToolsOptions {
  workspaceId?: string
  contactId?: string
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  maxToolCalls?: number
  onToolCall?: (log: ToolCallLog) => void
}

export interface ChatWithToolsResult {
  content: string
  toolCalls: ToolCallLog[]
  totalTokens: number
  model: string
  loopCount: number
}

// ─── Simple Event Bus for Tool Calls ─────────────────────────

type ToolCallListener = (log: ToolCallLog) => void
const _toolCallListeners = new Set<ToolCallListener>()

/**
 * Subscribe to tool call events.
 */
export function onToolCallEvent(listener: ToolCallListener): () => void {
  _toolCallListeners.add(listener)
  return () => _toolCallListeners.delete(listener)
}

/**
 * Emit a tool call event to all subscribers.
 */
export function emitToolCall(log: ToolCallLog): void {
  logInfo('AI', 'tool_call', {
    tool: log.toolName,
    callId: log.toolCallId,
    success: log.success,
    durationMs: log.durationMs,
    workspaceId: log.workspaceId,
    contactId: log.contactId,
  })

  for (const listener of _toolCallListeners) {
    try {
      listener(log)
    } catch (err) {
      console.error('[ToolCalling] Listener error:', err)
    }
  }
}

// ─── Tool Definitions ────────────────────────────────────────

const MAX_TOOL_CALLS_DEFAULT = 5

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'calendar_create_event',
      description: 'Create a new calendar event or appointment. Links to an optional contact.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID the appointment belongs to',
          },
          title: {
            type: 'string',
            description: 'Appointment title (e.g. "Reunión con Juan — Sentra")',
          },
          description: {
            type: 'string',
            description: 'Optional description or notes for the appointment',
          },
          date: {
            type: 'string',
            description: 'ISO date-time string for the appointment (e.g. "2025-01-15T10:00:00.000Z")',
          },
          duration: {
            type: 'integer',
            description: 'Duration in minutes (default 30)',
          },
          type: {
            type: 'string',
            description: 'Appointment type',
            enum: ['call', 'meeting', 'followup', 'task'],
          },
          contactId: {
            type: 'string',
            description: 'Optional contact ID to link the appointment to',
          },
        },
        required: ['workspaceId', 'title', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_list_events',
      description: 'List upcoming calendar events/appointments for a workspace, optionally filtered by date range.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to list events for',
          },
          fromDate: {
            type: 'string',
            description: 'ISO date-time to start listing from (defaults to now)',
          },
          toDate: {
            type: 'string',
            description: 'ISO date-time to stop listing at (defaults to 30 days from now)',
          },
          status: {
            type: 'string',
            description: 'Filter by status',
            enum: ['pending', 'completed', 'cancelled'],
          },
          limit: {
            type: 'integer',
            description: 'Max events to return (default 20)',
          },
        },
        required: ['workspaceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crm_update_lead',
      description: 'Update a lead/contact score, stage (temperature), or notes in the CRM.',
      parameters: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: 'The contact ID to update',
          },
          leadScore: {
            type: 'integer',
            description: 'New lead score (0-100)',
          },
          temperature: {
            type: 'string',
            description: 'New temperature level',
            enum: ['cold', 'warm', 'hot'],
          },
          notes: {
            type: 'string',
            description: 'Append a note to the contact (does not overwrite existing notes)',
          },
          status: {
            type: 'string',
            description: 'Update contact status',
            enum: ['active', 'inactive', 'archived', 'blocked'],
          },
        },
        required: ['contactId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crm_create_deal',
      description: 'Create a new deal/opportunity in the sales pipeline.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID',
          },
          pipelineId: {
            type: 'string',
            description: 'The pipeline ID to add the deal to',
          },
          title: {
            type: 'string',
            description: 'Deal title (e.g. "Venta Sentra 2025")',
          },
          value: {
            type: 'number',
            description: 'Deal value in the default currency',
          },
          currency: {
            type: 'string',
            description: 'Currency code (default "MXN")',
          },
          contactId: {
            type: 'string',
            description: 'Optional contact ID to link the deal to',
          },
          description: {
            type: 'string',
            description: 'Optional deal description',
          },
        },
        required: ['workspaceId', 'pipelineId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crm_get_contact',
      description: 'Look up a contact by ID, phone number, or name. Returns contact details, lead profile, and recent deal info.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to search in',
          },
          contactId: {
            type: 'string',
            description: 'Exact contact ID',
          },
          phone: {
            type: 'string',
            description: 'Phone number to search by (exact match)',
          },
          name: {
            type: 'string',
            description: 'Name to search by (partial match on firstName or lastName)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'whatsapp_send_message',
      description: 'Send a WhatsApp message to a phone number. Requires an active WhatsApp connection.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Recipient phone number (e.g. "+5215512345678")',
          },
          message: {
            type: 'string',
            description: 'The text message to send',
          },
          workspaceId: {
            type: 'string',
            description: 'The workspace ID (for logging)',
          },
        },
        required: ['phone', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'followup_create',
      description: 'Schedule a follow-up task for a contact via a conversation.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID',
          },
          contactId: {
            type: 'string',
            description: 'The contact ID for the follow-up',
          },
          conversationId: {
            type: 'string',
            description: 'The conversation ID associated with the follow-up',
          },
          scheduledAt: {
            type: 'string',
            description: 'ISO date-time when the follow-up should be sent',
          },
          messageTemplate: {
            type: 'string',
            description: 'The message template to send when the follow-up triggers',
          },
          ruleId: {
            type: 'string',
            description: 'Optional follow-up rule ID (creates a generic one if omitted)',
          },
        },
        required: ['workspaceId', 'contactId', 'conversationId', 'scheduledAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'nexus_get_temperature',
      description: 'Get the current emotional/wellness temperature for a user from their Nexus profile, including recent temperature log history.',
      parameters: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'The user ID whose temperature to fetch',
          },
          includeHistory: {
            type: 'boolean',
            description: 'Whether to include recent temperature log entries (default false)',
          },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'nexus_store_memory',
      description: 'Store a memory/fact about a user in the Nexus memory system. Memories are keyed — updating an existing key overwrites it.',
      parameters: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'The user ID',
          },
          key: {
            type: 'string',
            description: 'A short unique key for this memory (e.g. "prefers_morning_calls")',
          },
          value: {
            type: 'string',
            description: 'The memory content (e.g. "This user prefers calls before 10am")',
          },
          category: {
            type: 'string',
            description: 'Memory category',
            enum: ['preference', 'fact', 'instruction', 'context', 'skill', 'general'],
          },
          importance: {
            type: 'integer',
            description: 'Importance level 1-10 (default 5)',
          },
        },
        required: ['userId', 'key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analytics_get_summary',
      description: 'Get an analytics summary for a workspace: total contacts, active deals, messages, revenue, conversion rate, etc.',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: 'The workspace ID to get analytics for',
          },
          daysBack: {
            type: 'integer',
            description: 'How many days to look back (default 30)',
          },
        },
        required: ['workspaceId'],
      },
    },
  },
]

// ─── Tool Execution Functions ────────────────────────────────

async function executeCalendarCreateEvent(
  args: Record<string, unknown>,
): Promise<string> {
  const { workspaceId, title, description, date, duration, type, contactId } = args

  if (!workspaceId || !title || !date) {
    return JSON.stringify({ error: 'workspaceId, title, and date are required' })
  }

  const event = await db.appointment.create({
    data: {
      workspaceId: workspaceId as string,
      title: title as string,
      description: (description as string) || null,
      date: new Date(date as string),
      duration: (duration as number) || 30,
      type: (type as string) || 'call',
      contactId: (contactId as string) || null,
    },
  })

  return JSON.stringify({
    success: true,
    event: {
      id: event.id,
      title: event.title,
      date: event.date.toISOString(),
      duration: event.duration,
      type: event.type,
      status: event.status,
    },
    message: `✅ Event created: "${event.title}" on ${event.date.toISOString()} (${event.duration}min)`,
  })
}

async function executeCalendarListEvents(
  args: Record<string, unknown>,
): Promise<string> {
  const { workspaceId, fromDate, toDate, status, limit } = args

  if (!workspaceId) {
    return JSON.stringify({ error: 'workspaceId is required' })
  }

  const now = new Date()
  const from = fromDate ? new Date(fromDate as string) : now
  const to = toDate
    ? new Date(toDate as string)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const events = await db.appointment.findMany({
    where: {
      workspaceId: workspaceId as string,
      date: { gte: from, lte: to },
      ...(status ? { status: status as string } : {}),
    },
    include: { contact: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    orderBy: { date: 'asc' },
    take: Math.min((limit as number) || 20, 50),
  })

  return JSON.stringify({
    success: true,
    total: events.length,
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date.toISOString(),
      duration: e.duration,
      type: e.type,
      status: e.status,
      contact: e.contact ? `${e.contact.firstName} ${e.contact.lastName || ''}` : null,
    })),
  })
}

async function executeCrmUpdateLead(
  args: Record<string, unknown>,
): Promise<string> {
  const { contactId, leadScore, temperature, notes, status } = args

  if (!contactId) {
    return JSON.stringify({ error: 'contactId is required' })
  }

  // Build update data dynamically
  const updateData: Record<string, unknown> = {}
  if (leadScore !== undefined) updateData.leadScore = leadScore as number
  if (temperature !== undefined) updateData.temperature = temperature as string
  if (status !== undefined) updateData.status = status as string
  if (notes !== undefined) {
    // Append note to existing notes
    const existing = await db.contact.findUnique({
      where: { id: contactId as string },
      select: { notes: true },
    })
    const timestamp = new Date().toISOString()
    const newNote = `[${timestamp}] ${notes}\n`
    updateData.notes = ((existing?.notes || '') + newNote).trim()
  }

  if (Object.keys(updateData).length === 0) {
    return JSON.stringify({ error: 'No fields to update. Provide at least one of: leadScore, temperature, notes, status' })
  }

  const updated = await db.contact.update({
    where: { id: contactId as string },
    data: updateData,
  })

  // Also update LeadProfile temperature if temperature changed
  if (temperature !== undefined) {
    try {
      await db.leadProfile.updateMany({
        where: { contactId: contactId as string },
        data: {
          temperature: temperature as string,
          lastActiveAt: new Date(),
        },
      })
    } catch {
      // leadProfile might not exist — that's fine
    }
  }

  const changes = Object.keys(updateData).join(', ')

  return JSON.stringify({
    success: true,
    updated: {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      leadScore: updated.leadScore,
      temperature: updated.temperature,
      status: updated.status,
    },
    changes,
    message: `✅ Lead updated: ${updated.firstName} — changed: ${changes}`,
  })
}

async function executeCrmCreateDeal(
  args: Record<string, unknown>,
): Promise<string> {
  const { workspaceId, pipelineId, title, value, currency, contactId, description } = args

  if (!workspaceId || !pipelineId || !title) {
    return JSON.stringify({ error: 'workspaceId, pipelineId, and title are required' })
  }

  // Get the first stage of the pipeline as default
  const firstStage = await db.pipelineStage.findFirst({
    where: { pipelineId: pipelineId as string },
    orderBy: { order: 'asc' },
  })

  const deal = await db.deal.create({
    data: {
      workspaceId: workspaceId as string,
      pipelineId: pipelineId as string,
      stageId: firstStage?.id || null,
      contactId: (contactId as string) || null,
      title: title as string,
      value: (value as number) || 0,
      currency: (currency as string) || 'MXN',
      description: (description as string) || null,
      status: 'active',
    },
  })

  return JSON.stringify({
    success: true,
    deal: {
      id: deal.id,
      title: deal.title,
      value: deal.value,
      currency: deal.currency,
      status: deal.status,
      stage: firstStage?.name || 'New',
    },
    message: `✅ Deal created: "${deal.title}" — ${deal.currency} ${deal.value} in stage "${firstStage?.name || 'New'}"`,
  })
}

async function executeCrmGetContact(
  args: Record<string, unknown>,
): Promise<string> {
  const { workspaceId, contactId, phone, name } = args

  if (contactId) {
    const contact = await db.contact.findUnique({
      where: { id: contactId as string },
      include: {
        leadProfile: true,
        deals: {
          where: { status: 'active' },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          include: { pipeline: { select: { name: true } }, stage: { select: { name: true } } },
        },
      },
    })

    if (!contact) {
      return JSON.stringify({ success: false, error: `Contact ${contactId} not found` })
    }

    return JSON.stringify({
      success: true,
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        status: contact.status,
        leadScore: contact.leadScore,
        temperature: contact.temperature,
        tags: JSON.parse(contact.tags || '[]'),
        notes: contact.notes,
        lastMessageAt: contact.lastMessageAt?.toISOString(),
        leadProfile: contact.leadProfile
          ? {
              archetype: contact.leadProfile.archetype,
              temperature: contact.leadProfile.temperature,
              score: contact.leadProfile.score,
              preferredProduct: contact.leadProfile.preferredProduct,
              mainObjection: contact.leadProfile.mainObjection,
              communicationStyle: contact.leadProfile.communicationStyle,
            }
          : null,
        activeDeals: contact.deals.map((d) => ({
          id: d.id,
          title: d.title,
          value: d.value,
          pipeline: d.pipeline.name,
          stage: d.stage?.name || 'Unassigned',
        })),
      },
    })
  }

  if (!workspaceId) {
    return JSON.stringify({ error: 'workspaceId is required when searching by phone or name' })
  }

  if (phone) {
    const contact = await db.contact.findFirst({
      where: { workspaceId: workspaceId as string, phone: phone as string },
      include: {
        leadProfile: true,
        deals: {
          where: { status: 'active' },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          include: { pipeline: { select: { name: true } }, stage: { select: { name: true } } },
        },
      },
    })

    if (!contact) {
      return JSON.stringify({ success: false, error: `No contact found with phone ${phone}` })
    }

    return JSON.stringify({
      success: true,
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
        status: contact.status,
        leadScore: contact.leadScore,
        temperature: contact.temperature,
        tags: JSON.parse(contact.tags || '[]'),
        notes: contact.notes,
        lastMessageAt: contact.lastMessageAt?.toISOString(),
        leadProfile: contact.leadProfile
          ? {
              archetype: contact.leadProfile.archetype,
              temperature: contact.leadProfile.temperature,
              score: contact.leadProfile.score,
            }
          : null,
        activeDeals: contact.deals.map((d) => ({
          id: d.id,
          title: d.title,
          value: d.value,
          pipeline: d.pipeline.name,
          stage: d.stage?.name || 'Unassigned',
        })),
      },
    })
  }

  if (name) {
    const contacts = await db.contact.findMany({
      where: {
        workspaceId: workspaceId as string,
        OR: [
          { firstName: { contains: name as string } },
          { lastName: { contains: name as string } },
        ],
      },
      include: { leadProfile: true },
      take: 10,
      orderBy: { lastMessageAt: 'desc' },
    })

    return JSON.stringify({
      success: true,
      total: contacts.length,
      contacts: contacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        status: c.status,
        leadScore: c.leadScore,
        temperature: c.temperature,
        tags: JSON.parse(c.tags || '[]'),
        archetype: c.leadProfile?.archetype || null,
      })),
    })
  }

  return JSON.stringify({ error: 'Provide one of: contactId, phone, or name' })
}

async function executeWhatsappSendMessage(
  args: Record<string, unknown>,
): Promise<string> {
  const { phone, message, workspaceId } = args

  if (!phone || !message) {
    return JSON.stringify({ error: 'phone and message are required' })
  }

  // Try Evolution API first, then ephemeral, then persistent
  let result: { success: boolean; id?: string; error?: string; source?: string } = {
    success: false,
    error: 'No WhatsApp connection available',
  }

  try {
    // Dynamic import to avoid bundling issues
    const { evolutionAPI } = await import('@/lib/whatsapp/evolution-api')
    if (evolutionAPI.isEnabled()) {
      result = await evolutionAPI.sendMessage(phone as string, message as string)
      result.source = 'evolution'
    }
  } catch {
    // Evolution API not configured
  }

  if (!result.success) {
    try {
      const ephemeralManager = (await import('@/lib/whatsapp/ephemeral-client')).ephemeralManager
      const sendResult = await ephemeralManager.sendAny(
        phone as string,
        message as string,
      )
      if (sendResult.success) {
        result = sendResult
      }
    } catch {
      // Ephemeral not available
    }
  }

  if (!result.success) {
    try {
      const whatsAppManager = (await import('@/lib/whatsapp/connection')).whatsAppManager
      const sendResult = await whatsAppManager.sendMessage(phone as string, message as string)
      if (sendResult.success) {
        result = sendResult
      }
    } catch {
      // Persistent not available
    }
  }

  // Log the message attempt as a message record if workspaceId is provided
  if (result.success && workspaceId) {
    try {
      // Find or create conversation for logging
      const contact = await db.contact.findFirst({
        where: { workspaceId: workspaceId as string, phone: phone as string },
      })
      if (contact) {
        const conversation = await db.conversation.findFirst({
          where: { workspaceId: workspaceId as string, contactId: contact.id, channel: 'whatsapp' },
        })
        if (conversation) {
          await db.message.create({
            data: {
              conversationId: conversation.id,
              content: message as string,
              type: 'text',
              direction: 'outbound',
              senderType: 'agent',
              status: 'sent',
            },
          })
        }
      }
    } catch {
      // Logging failure is non-critical
    }
  }

  if (result.success) {
    return JSON.stringify({
      success: true,
      messageId: result.id,
      source: result.source || 'unknown',
      message: `✅ WhatsApp message sent to ${phone} via ${result.source || 'unknown'}`,
    })
  }

  return JSON.stringify({
    success: false,
    error: result.error || 'All WhatsApp channels unavailable',
    message: `❌ Could not send WhatsApp message to ${phone}: ${result.error}`,
  })
}

async function executeFollowupCreate(
  args: Record<string, unknown>,
): Promise<string> {
  const { workspaceId, contactId, conversationId, scheduledAt, messageTemplate, ruleId } = args

  if (!workspaceId || !contactId || !conversationId || !scheduledAt) {
    return JSON.stringify({ error: 'workspaceId, contactId, conversationId, and scheduledAt are required' })
  }

  // Get or create a default follow-up rule
  let actualRuleId = ruleId as string | undefined

  if (!actualRuleId) {
    // Find an existing inactivity rule for this workspace
    const existingRule = await db.followUpRule.findFirst({
      where: { workspaceId: workspaceId as string, triggerType: 'inactivity', isActive: true },
    })

    if (existingRule) {
      actualRuleId = existingRule.id
    } else {
      // Create a default rule
      const newRule = await db.followUpRule.create({
        data: {
          workspaceId: workspaceId as string,
          name: 'AI Scheduled Follow-up',
          description: 'Follow-up scheduled by AI assistant',
          triggerType: 'scheduled',
          channel: 'whatsapp',
          messageTemplate: messageTemplate ? String(messageTemplate) : 'Hola, ¿cómo estás? Te escribo para dar seguimiento.',
          isActive: true,
        },
      })
      actualRuleId = newRule.id
    }
  }

  const task = await db.followUpTask.create({
    data: {
      workspaceId: workspaceId as string,
      ruleId: actualRuleId,
      contactId: contactId as string,
      conversationId: conversationId as string,
      scheduledAt: new Date(scheduledAt as string),
      status: 'pending',
    },
  })

  return JSON.stringify({
    success: true,
    followUp: {
      id: task.id,
      scheduledAt: task.scheduledAt.toISOString(),
      status: task.status,
    },
    message: `✅ Follow-up scheduled for ${task.scheduledAt.toISOString()}`,
  })
}

async function executeNexusGetTemperature(
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, includeHistory } = args

  if (!userId) {
    return JSON.stringify({ error: 'userId is required' })
  }

  const profile = await db.nexusProfile.findUnique({
    where: { userId: userId as string },
  })

  if (!profile) {
    return JSON.stringify({
      success: false,
      error: `No Nexus profile found for user ${userId}`,
      temperature: 50.0,
      label: 'No profile',
    })
  }

  let history: Array<{ value: number; label: string | null; source: string; createdAt: string }> = []
  if (includeHistory) {
    const logs = await db.nexusTemperatureLog.findMany({
      where: { userId: userId as string },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    history = logs.map((log) => ({
      value: log.value,
      label: log.label,
      source: log.source,
      createdAt: log.createdAt.toISOString(),
    }))
  }

  // Determine temperature label
  const temp = profile.temperature
  let label = 'Neutral'
  if (temp >= 75) label = 'Excelente 😊'
  else if (temp >= 55) label = 'Bien 👍'
  else if (temp >= 35) label = 'Regular 😐'
  else if (temp >= 20) label = 'Bajo 😟'
  else label = 'Preocupante 😞'

  return JSON.stringify({
    success: true,
    temperature: {
      value: temp,
      label,
      updatedAt: profile.tempUpdatedAt?.toISOString() || null,
      source: 'nexus_profile',
    },
    vacationMode: profile.vacationMode,
    history: history.length > 0 ? history : undefined,
  })
}

async function executeNexusStoreMemory(
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, key, value, category, importance } = args

  if (!userId || !key || !value) {
    return JSON.stringify({ error: 'userId, key, and value are required' })
  }

  const memory = await db.nexusMemory.upsert({
    where: {
      userId_key: {
        userId: userId as string,
        key: key as string,
      },
    },
    update: {
      value: value as string,
      category: (category as string) || 'general',
      importance: (importance as number) || 5,
      lastAccessed: new Date(),
    },
    create: {
      userId: userId as string,
      key: key as string,
      value: value as string,
      category: (category as string) || 'general',
      source: 'conversation',
      importance: (importance as number) || 5,
    },
  })

  return JSON.stringify({
    success: true,
    memory: {
      id: memory.id,
      key: memory.key,
      category: memory.category,
      importance: memory.importance,
    },
    message: `✅ Memory stored: "${key}" → "${(value as string).slice(0, 80)}${(value as string).length > 80 ? '...' : ''}"`,
  })
}

async function executeAnalyticsGetSummary(
  args: Record<string, unknown>,
): Promise<string> {
  const { workspaceId, daysBack } = args

  if (!workspaceId) {
    return JSON.stringify({ error: 'workspaceId is required' })
  }

  const days = (daysBack as number) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Run all queries in parallel
  const [
    totalContacts,
    activeContacts,
    totalDeals,
    wonDeals,
    lostDeals,
    activeDeals,
    totalRevenue,
    pipelineValue,
    activeConversations,
    totalMessages,
    appointments,
    aiMessages,
  ] = await Promise.all([
    db.contact.count({ where: { workspaceId: workspaceId as string } }),
    db.contact.count({ where: { workspaceId: workspaceId as string, status: 'active' } }),
    db.deal.count({ where: { workspaceId: workspaceId as string, createdAt: { gte: since } } }),
    db.deal.count({ where: { workspaceId: workspaceId as string, status: 'won', wonAt: { gte: since } } }),
    db.deal.count({ where: { workspaceId: workspaceId as string, status: 'lost', lostAt: { gte: since } } }),
    db.deal.count({ where: { workspaceId: workspaceId as string, status: 'active' } }),
    db.deal.aggregate({
      where: { workspaceId: workspaceId as string, status: 'won', wonAt: { gte: since } },
      _sum: { value: true },
    }),
    db.deal.aggregate({
      where: { workspaceId: workspaceId as string, status: 'active' },
      _sum: { value: true },
    }),
    db.conversation.count({ where: { workspaceId: workspaceId as string, status: 'active' } }),
    db.message.count({
      where: {
        conversation: { workspaceId: workspaceId as string },
        createdAt: { gte: since },
      },
    }),
    db.appointment.count({
      where: { workspaceId: workspaceId as string, date: { gte: since } },
    }),
    db.message.count({
      where: {
        conversation: { workspaceId: workspaceId as string },
        isAiGenerated: true,
        createdAt: { gte: since },
      },
    }),
  ])

  const conversionRate = totalDeals > 0
    ? Math.round((wonDeals / totalDeals) * 100)
    : 0

  return JSON.stringify({
    success: true,
    period: `Last ${days} days`,
    summary: {
      contacts: {
        total: totalContacts,
        active: activeContacts,
      },
      deals: {
        total: totalDeals,
        won: wonDeals,
        lost: lostDeals,
        active: activeDeals,
        wonRevenue: totalRevenue._sum.value || 0,
        pipelineValue: pipelineValue._sum.value || 0,
        conversionRate,
      },
      conversations: {
        active: activeConversations,
      },
      messages: {
        total: totalMessages,
        aiGenerated: aiMessages,
        aiPercentage: totalMessages > 0 ? Math.round((aiMessages / totalMessages) * 100) : 0,
      },
      appointments,
    },
    highlights: [
      wonDeals > 0 ? `🎉 ${wonDeals} deal(s) won for $${(totalRevenue._sum.value || 0).toLocaleString()}` : null,
      activeDeals > 0 ? `💼 ${activeDeals} active deal(s) worth $${(pipelineValue._sum.value || 0).toLocaleString()}` : null,
      aiMessages > 0 ? `🤖 ${aiMessages} AI-generated messages (${Math.round((aiMessages / totalMessages) * 100)}% of total)` : null,
    ].filter(Boolean),
  })
}

// ─── Tool Executor Map ───────────────────────────────────────

const TOOL_EXECUTORS: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  calendar_create_event: executeCalendarCreateEvent,
  calendar_list_events: executeCalendarListEvents,
  crm_update_lead: executeCrmUpdateLead,
  crm_create_deal: executeCrmCreateDeal,
  crm_get_contact: executeCrmGetContact,
  whatsapp_send_message: executeWhatsappSendMessage,
  followup_create: executeFollowupCreate,
  nexus_get_temperature: executeNexusGetTemperature,
  nexus_store_memory: executeNexusStoreMemory,
  analytics_get_summary: executeAnalyticsGetSummary,
}

// ─── GLM API with Function Calling ───────────────────────────

interface GLMChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

async function callGLMWithTools(
  messages: GLMChatMessage[],
  tools: ToolDefinition[],
  model?: string,
  temperature?: number,
  maxTokens?: number,
): Promise<{
  content: string | null
  toolCalls: ToolCall[] | null
  model: string
  tokensUsed: number
}> {
  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) throw new Error('ZAI_API_KEY not set')

  const token = generateGLMToken(apiKey)
  const targetModel = model || 'GLM-4.5-Flash'

  // GLM models that support function calling
  const functionCallingModels = ['GLM-4.5-Flash', 'glm-4-plus', 'glm-4-flash', 'glm-4-air']
  const useModel = functionCallingModels.includes(targetModel) ? targetModel : 'GLM-4.5-Flash'

  const body: Record<string, unknown> = {
    model: useModel,
    messages: messages.map((m) => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content ?? '' }
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      return msg
    }),
    tools: tools,
    temperature: temperature ?? 0.3,
    max_tokens: maxTokens ?? 4096,
  }

  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`GLM API error ${res.status}: ${errorText.slice(0, 300)}`)
  }

  const data = await res.json()
  const message = data.choices?.[0]?.message
  const content = message?.content || null
  const toolCalls = message?.tool_calls || null

  return {
    content,
    toolCalls,
    model: useModel,
    tokensUsed: data.usage?.total_tokens ?? 0,
  }
}

// ─── Main: Chat with Tools ──────────────────────────────────

/**
 * Send a message to the AI with tool calling enabled.
 * Handles the full tool-calling loop:
 *   1. Send message + tools to AI
 *   2. If AI returns tool_calls → execute each → feed results back
 *   3. Repeat until AI returns a text response or max calls reached
 *
 * @param userMessage - The user's message text
 * @param contextMessages - Prior conversation history (system + user + assistant)
 * @param options - Configuration options
 */
export async function chatWithTools(
  userMessage: string,
  contextMessages: GLMChatMessage[] = [],
  options: ChatWithToolsOptions = {},
): Promise<ChatWithToolsResult> {
  const {
    workspaceId,
    contactId,
    provider,
    model,
    temperature = 0.3,
    maxTokens = 4096,
    systemPrompt,
    maxToolCalls = MAX_TOOL_CALLS_DEFAULT,
    onToolCall,
  } = options

  const timer = logTimer('AI', 'chatWithTools')
  const toolCallLogs: ToolCallLog[] = []
  let totalTokens = 0
  let usedModel = model || 'GLM-4.5-Flash'

  // Build initial messages array
  const messages: GLMChatMessage[] = []

  // System prompt
  const sysPrompt = systemPrompt || `You are a helpful AI assistant with access to tools for managing CRM, calendar, WhatsApp messaging, follow-ups, and analytics. Use the tools when the user asks you to perform an action. Always confirm actions that modify data. Respond in the same language the user writes in.`

  messages.push({ role: 'system', content: sysPrompt })

  // Inject workspace/contact context if provided
  if (workspaceId) {
    messages.push({
      role: 'system',
      content: `Context: Current workspace ID is "${workspaceId}". Use this as the default workspaceId for all tool calls unless the user specifies a different one.${contactId ? ` Current contact ID is "${contactId}".` : ''}`,
    })
  }

  // Add conversation history
  for (const msg of contextMessages) {
    if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') {
      messages.push(msg)
    }
  }

  // Add the user's message
  messages.push({ role: 'user', content: userMessage })

  // ─── Tool Loop ───────────────────────────────────────────
  let loopCount = 0

  while (loopCount < maxToolCalls) {
    loopCount++

    try {
      const response = await callGLMWithTools(messages, TOOL_DEFINITIONS, usedModel, temperature, maxTokens)
      totalTokens += response.tokensUsed
      usedModel = response.model

      // If no tool calls, return the final text content
      if (!response.toolCalls || response.toolCalls.length === 0) {
        timer.end('ok', { loopCount, totalTokens, toolCalls: toolCallLogs.length })
        return {
          content: response.content || '',
          toolCalls: toolCallLogs,
          totalTokens,
          model: usedModel,
          loopCount,
        }
      }

      // Add assistant message with tool_calls to the conversation
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      })

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        const toolTimer = logTimer('AI', `tool:${toolCall.function.name}`)
        let toolResult: string
        let toolSuccess = true

        try {
          // Parse arguments
          const args = JSON.parse(toolCall.function.arguments || '{}')

          logInfo('AI', `tool_exec:${toolCall.function.name}`, { args, callId: toolCall.id })

          // Find and execute the tool
          const executor = TOOL_EXECUTORS[toolCall.function.name]
          if (!executor) {
            toolResult = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` })
            toolSuccess = false
          } else {
            toolResult = await executor(args)
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          toolResult = JSON.stringify({ error: `Tool execution failed: ${errMsg}` })
          toolSuccess = false
          logError('AI', `tool_error:${toolCall.function.name}`, err)
        }

        const durationMs = toolTimer.end(toolSuccess ? 'ok' : 'error', { success: toolSuccess })

        // Add tool result to conversation
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        })

        // Build and emit log
        const logEntry: ToolCallLog = {
          toolName: toolCall.function.name,
          toolCallId: toolCall.id,
          arguments: JSON.parse(toolCall.function.arguments || '{}'),
          result: toolResult,
          success: toolSuccess,
          durationMs,
          timestamp: new Date().toISOString(),
          workspaceId,
          contactId,
        }

        toolCallLogs.push(logEntry)
        emitToolCall(logEntry)

        // Notify callback if provided
        if (onToolCall) {
          try {
            onToolCall(logEntry)
          } catch {
            // Callback error should not break the loop
          }
        }
      }

      // Loop continues — the next iteration will send the tool results to the AI
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logError('AI', 'chatWithTools_loop', err, { loopCount })

      // If the API call itself fails, break the loop and return what we have
      timer.end('error', { loopCount, totalTokens, toolCalls: toolCallLogs.length })
      return {
        content: toolCallLogs.length > 0
          ? `I executed ${toolCallLogs.length} tool(s) but encountered an error continuing: ${errMsg}`
          : `Error communicating with AI: ${errMsg}`,
        toolCalls: toolCallLogs,
        totalTokens,
        model: usedModel,
        loopCount,
      }
    }
  }

  // Max tool calls reached — try one final call without tools to get a text response
  logWarn('AI', 'tool_max_calls_reached', { loopCount, maxToolCalls })

  try {
    const finalResponse = await callGLMWithTools(messages, [], usedModel, temperature, maxTokens)
    totalTokens += finalResponse.tokensUsed
    usedModel = finalResponse.model

    timer.end('ok', { loopCount, totalTokens, toolCalls: toolCallLogs.length, maxReached: true })
    return {
      content: finalResponse.content || `I executed ${toolCallLogs.length} tool(s) but reached the maximum number of tool calls. Here's a summary of what was done:\n\n${toolCallLogs.map((l) => `- ${l.toolName}: ${l.success ? '✅' : '❌'}`).join('\n')}`,
      toolCalls: toolCallLogs,
      totalTokens,
      model: usedModel,
      loopCount,
    }
  } catch {
    timer.end('warn', { loopCount, totalTokens, toolCalls: toolCallLogs.length, maxReached: true })
    return {
      content: `I executed ${toolCallLogs.length} tool(s) and reached the maximum tool call limit. Here's what was done:\n\n${toolCallLogs.map((l) => `- **${l.toolName}**: ${l.success ? 'Success' : 'Failed'}`).join('\n')}`,
      toolCalls: toolCallLogs,
      totalTokens,
      model: usedModel,
      loopCount,
    }
  }
}

// ─── Convenience: Parse tool name from natural language ──────

/**
 * Get all tool definitions as JSON (useful for the frontend or API).
 */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS
}

/**
 * Get tool definition by name.
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.function.name === name)
}

/**
 * Get list of available tool names.
 */
export function getToolNames(): string[] {
  return TOOL_DEFINITIONS.map((t) => t.function.name)
}

// ─── Unsafe Execute (for testing / internal use only) ───────

/**
 * Execute a single tool by name with given arguments.
 * NOT exposed to AI — only for programmatic use.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceId?: string,
  contactId?: string,
): Promise<ToolCallLog> {
  const timer = logTimer('AI', `manual_tool:${toolName}`)
  let result: string
  let success = true

  try {
    const executor = TOOL_EXECUTORS[toolName]
    if (!executor) {
      throw new Error(`Unknown tool: ${toolName}`)
    }
    result = await executor(args)
  } catch (err) {
    result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
    success = false
  }

  const durationMs = timer.end(success ? 'ok' : 'error')

  const log: ToolCallLog = {
    toolName,
    toolCallId: `manual_${Date.now()}`,
    arguments: args,
    result,
    success,
    durationMs,
    timestamp: new Date().toISOString(),
    workspaceId,
    contactId,
  }

  emitToolCall(log)
  return log
}
