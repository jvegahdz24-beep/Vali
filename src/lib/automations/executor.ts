import { db } from '@/lib/db'
import { routedSendText } from '@/lib/whatsapp/channel-router'

export interface AutomationAction {
  type: string
  payload?: Record<string, unknown>
  config?: Record<string, unknown>
}

export interface AutomationContact {
  id: string
  firstName: string
  lastName: string | null
  phone: string | null
}

export interface AutomationExecutionInput {
  automationId: string
  workspaceId: string
  actions: AutomationAction[]
  contact?: AutomationContact | null
  context?: Record<string, unknown>
}

export interface AutomationExecutionResult {
  executedActions: string[]
  errors: string[]
}

const CONTACT_UPDATE_FIELDS = ['leadScore', 'tags', 'assignedTo', 'stage'] as const

function getActionValue(action: AutomationAction, key: string): unknown {
  return action.payload?.[key] ?? action.config?.[key]
}

function parseTags(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}

function resolveMessage(action: AutomationAction, contact: AutomationContact): string {
  const raw = getActionValue(action, 'message') ??
    getActionValue(action, 'content') ??
    getActionValue(action, 'template')
  if (typeof raw !== 'string') return ''

  return raw
    .replace(/\[NOMBRE\]/gi, contact.firstName)
    .replace(/\[APELLIDO\]/gi, contact.lastName || '')
    .replace(/\{\{name\}\}/gi, contact.firstName)
    .replace(/\{\{firstName\}\}/gi, contact.firstName)
    .replace(/\{\{lastName\}\}/gi, contact.lastName || '')
}

async function executeSendMessage(
  input: AutomationExecutionInput,
  action: AutomationAction,
): Promise<string> {
  const contact = input.contact
  if (!contact) throw new Error('send_message requires a contact')
  if (!contact.phone) throw new Error('send_message requires a contact phone')

  const messageText = resolveMessage(action, contact)
  if (!messageText) throw new Error('send_message requires a non-empty message')

  const sendResult = await routedSendText(input.workspaceId, contact.phone, messageText)
  if (!sendResult.success) {
    throw new Error(sendResult.error || 'WhatsApp provider rejected the message')
  }

  let conversation = await db.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      status: 'active',
    },
    select: { id: true },
  })

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        channel: 'whatsapp',
        status: 'active',
        lastMessageAt: new Date(),
        lastMessagePreview: messageText.slice(0, 100),
      },
      select: { id: true },
    })
  }

  await db.message.create({
    data: {
      conversationId: conversation.id,
      content: messageText,
      type: 'text',
      direction: 'outbound',
      senderType: 'agent',
      isAiGenerated: false,
      status: 'sent',
      externalId: sendResult.messageId,
      metadata: JSON.stringify({ source: 'automation', automationId: input.automationId }),
    },
  })

  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: messageText.slice(0, 100) },
  })
  await db.contact.update({ where: { id: contact.id }, data: { lastMessageAt: new Date() } })

  return `send_message: "${messageText.slice(0, 50)}"`
}

async function executeUpdateContact(
  input: AutomationExecutionInput,
  action: AutomationAction,
): Promise<string> {
  const contact = input.contact
  if (!contact) throw new Error('update_contact requires a contact')
  const source = { ...(action.config || {}), ...(action.payload || {}) }
  const updateData: Record<string, unknown> = {}

  for (const key of CONTACT_UPDATE_FIELDS) {
    if (key in source) updateData[key] = source[key]
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('update_contact has no supported fields')
  }

  await db.contact.update({
    where: { id: contact.id },
    data: updateData as Parameters<typeof db.contact.update>[0]['data'],
  })
  return `update_contact: ${Object.keys(updateData).join(', ')}`
}

async function executeAddTag(
  input: AutomationExecutionInput,
  action: AutomationAction,
): Promise<string> {
  const contact = input.contact
  if (!contact) throw new Error('add_tag requires a contact')
  const tag = getActionValue(action, 'tag')
  if (typeof tag !== 'string' || !tag.trim()) throw new Error('add_tag requires a tag')

  const existing = await db.contact.findUnique({ where: { id: contact.id }, select: { tags: true } })
  const currentTags = parseTags(existing?.tags)
  if (!currentTags.includes(tag)) {
    await db.contact.update({
      where: { id: contact.id },
      data: { tags: JSON.stringify([...currentTags, tag]) },
    })
  }
  return `add_tag: "${tag}"`
}

async function executeWebhook(
  input: AutomationExecutionInput,
  action: AutomationAction,
): Promise<string> {
  const url = getActionValue(action, 'url')
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new Error('webhook requires an https URL')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      automationId: input.automationId,
      contactId: input.contact?.id,
      context: input.context,
      triggeredAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`webhook returned HTTP ${response.status}`)
  return `webhook: ${url}`
}

export async function executeAutomationActions(
  input: AutomationExecutionInput,
): Promise<AutomationExecutionResult> {
  const executedActions: string[] = []
  const errors: string[] = []

  for (const action of input.actions) {
    try {
      switch (action.type) {
        case 'send_message':
          executedActions.push(await executeSendMessage(input, action))
          break
        case 'update_contact':
          executedActions.push(await executeUpdateContact(input, action))
          break
        case 'add_tag':
        case 'tag_contact':
          executedActions.push(await executeAddTag(input, action))
          break
        case 'webhook':
          executedActions.push(await executeWebhook(input, action))
          break
        default:
          errors.push(`${action.type}: unsupported action type`)
      }
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : String(actionError)
      errors.push(`${action.type}: ${message}`)
    }
  }

  return { executedActions, errors }
}
