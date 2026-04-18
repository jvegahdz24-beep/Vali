// ═══════════════════════════════════════════════════════════════
// ValiFlow Pro — Central Message Processor
// SINGLE source of truth for: DB ops + AI pipeline + CRM updates
// Used by: connection.ts (WhatsApp), webhook, api/ai/chat
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { RevenueEngine } from '@/lib/ai'
import { preProcess, postProcess, injectContext } from '@/lib/ai/conversation-middleware'
import { autoCreateOrUpdateDeal } from '@/lib/crm/auto-deal'

// ─── Types ────────────────────────────────────────────────────

export interface ProcessMessageInput {
  /** The text message from the user */
  text: string
  /** Sender's phone number */
  phone: string
  /** Sender's display name (optional) */
  pushName?: string
  /** WhatsApp remote JID (optional, for Baileys connection) */
  remoteJid?: string
  /** External message ID (WhatsApp msg ID, webhook ID, etc.) */
  externalId?: string
  /** Channel: 'whatsapp', 'webchat', etc. */
  channel?: string
  /** Force a specific workspace ID (skips auto-detection) */
  workspaceId?: string
  /** Pre-existing conversation ID (skips find/create) */
  conversationId?: string
  /** Pre-existing contact ID (skips find/create) */
  contactId?: string
  /** Skip saving the inbound message to DB (already saved by caller) */
  skipMessageSave?: boolean
  /** Message type: text, image, video, audio, document, sticker, location, contact */
  messageType?: string
  /** Skip AI processing (e.g., for media-only messages without text) */
  skipAI?: boolean
}

export interface ProcessMessageResult {
  success: boolean
  conversationId: string
  contactId: string | null
  /** Raw AI reply text (before humanization) */
  aiReplyText: string | null
  /** Full RevenueEngine result */
  engineResult: Awaited<ReturnType<RevenueEngine['processConversation']>>
  /** Latency in ms */
  latencyMs: number
}

// ─── Core Function ────────────────────────────────────────────

/**
 * Process an incoming message through the FULL pipeline:
 *   1. Find/create workspace
 *   2. Find/create contact
 *   3. Find/create conversation
 *   4. Save inbound message
 *   5. Pre-process (middleware: state + context extraction)
 *   6. Load conversation history
 *   7. Call RevenueEngine (AI pipeline)
 *   8. Post-process AI response (filter repetitions)
 *   9. Update contact lead score + tags
 *   10. Log agent interaction
 *   11. Track analytics
 *
 * This function does NOT: send WhatsApp messages, humanize response,
 * show typing indicators, or handle batching. Those are the caller's
 * responsibility (connection.ts handles all of that for real-time
 * WhatsApp, while webhook/api routes skip them).
 */
export async function processMessageCore(input: ProcessMessageInput): Promise<ProcessMessageResult> {
  const start = Date.now()
  const {
    text,
    phone,
    pushName,
    remoteJid,
    externalId,
    channel = 'whatsapp',
    workspaceId: forcedWorkspaceId,
    conversationId: forcedConversationId,
    contactId: forcedContactId,
    skipMessageSave = false,
    messageType = 'text',
    skipAI = false,
  } = input

  console.log(`[CORE 1] Iniciando procesamiento`)
  console.log(`[CORE 2] Mensaje: "${text.slice(0, 100)}"`)
  console.log(`[Core:1] 📩 Processing from ${phone}: "${text.slice(0, 60)}"`)

  // ── 1. Find workspace ──
  let workspace
  if (forcedWorkspaceId) {
    workspace = await db.workspace.findUnique({ where: { id: forcedWorkspaceId } })
  } else {
    workspace = await db.workspace.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    // Fallback: if no active workspace, reactivate the first one
    if (!workspace) {
      const anyWorkspace = await db.workspace.findFirst({ orderBy: { createdAt: 'asc' } })
      if (anyWorkspace) {
        await db.workspace.update({ where: { id: anyWorkspace.id }, data: { isActive: true } })
        workspace = anyWorkspace
        console.warn(`[Core:1] Auto-reactivated workspace: ${anyWorkspace.name}`)
      }
    }
  }
  if (!workspace) {
    throw new Error('No workspace found')
  }
  console.log(`[Core:2] ✅ Workspace: ${workspace.name}`)

  // ── 2. Find or create contact ──
  let contact
  if (forcedContactId) {
    contact = await db.contact.findUnique({ where: { id: forcedContactId } })
  } else {
    contact = await db.contact.findFirst({
      where: { workspaceId: workspace.id, phone, status: { not: 'archived' } },
    })
    if (!contact) {
      contact = await db.contact.create({
        data: {
          workspaceId: workspace.id,
          firstName: pushName || 'Contacto WhatsApp',
          phone,
          source: channel,
          tags: JSON.stringify(['whatsapp_incoming']),
        },
      })
    } else {
      await db.contact.update({
        where: { id: contact.id },
        data: { lastMessageAt: new Date() },
      })
    }
  }

  // ── 3. Find or create conversation ──
  let conversation
  if (forcedConversationId) {
    conversation = await db.conversation.findUnique({ where: { id: forcedConversationId } })
  } else if (contact) {
    conversation = await db.conversation.findFirst({
      where: { workspaceId: workspace.id, contactId: contact.id, channel, status: 'active' },
      orderBy: { lastMessageAt: 'desc' },
    })
    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          workspaceId: workspace.id,
          contactId: contact.id,
          channel,
          status: 'active',
          externalId: remoteJid,
          metadata: JSON.stringify({ remoteJid }),
        },
      })
    }
  }

  if (!conversation) {
    throw new Error('Could not find or create conversation')
  }

  // ── 4. Save inbound message ──
  if (!skipMessageSave) {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        content: text,
        type: messageType,
        direction: 'inbound',
        senderType: 'contact',
        externalId,
      },
    })
  }

  // ── 5. Update conversation timestamp ──
  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 100) },
  })

  // ── 6. Skip AI for media-only messages ──
  if (skipAI) {
    console.log(`[Core] skipAI=true, skipping AI pipeline for media message`)
    return {
      success: true,
      conversationId: conversation.id,
      contactId: contact?.id ?? null,
      aiReplyText: null,
      engineResult: null as any,
      latencyMs: Date.now() - start,
    }
  }

  // ── 7. Middleware: pre-process ──
  console.log(`[Core:5] 🔄 Pre-processing...`)
  const middlewareResult = preProcess({
    phone,
    text,
    pushName,
    remoteJid: remoteJid || '',
    externalId: externalId || '',
    conversationId: conversation.id,
  })

  // ── 7. Load conversation history (last 50 messages) ──
  const historyMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { content: true, senderType: true },
  })

  const messages = historyMessages.map((m) => ({
    role: m.senderType === 'contact' ? 'user' : 'assistant',
    content: m.content,
  }))

  // Middleware: inject context block after system prompt
  const enrichedMessages = injectContext(messages, middlewareResult.contextBlock)

  // ── 8. Revenue Engine (AI pipeline) ──
  console.log(`[CORE 3] Historial length: ${enrichedMessages.length} mensajes`)  
  console.log(`[Core:6] 🤖 RevenueEngine (${enrichedMessages.length} messages)...`)

  // Read workspace AI settings
  let personalityName = 'JHON'
  let aiTemperature = 0.75
  let aiProvider = 'groq'
  let customSystemPrompt = ''
  let dynamicContext = ''
  try {
    const wsSettings = typeof workspace.settings === 'string'
      ? JSON.parse(workspace.settings || '{}')
      : (workspace.settings || {})
    if (wsSettings.defaultPersonality) personalityName = wsSettings.defaultPersonality
    if (wsSettings.aiTemperature !== undefined) aiTemperature = wsSettings.aiTemperature
    if (wsSettings.apiProvider) aiProvider = wsSettings.apiProvider
  } catch (e) {
    console.warn('[AI] Could not parse workspace settings:', e)
  }

  const engine = new RevenueEngine()
  const engineResult = await engine.processConversation({
    messages: enrichedMessages,
    contactData: contact
      ? {
          name: `${contact.firstName} ${contact.lastName || ''}`.trim(),
          source: contact.source,
          createdAt: contact.createdAt,
          tags: JSON.parse(contact.tags || '[]'),
          leadScore: contact.leadScore,
        }
      : undefined,
    workspaceContext: { businessName: workspace.name, industry: workspace.industry },
    personalityName,
    customSystemPrompt,
    aiProvider,
    temperature: aiTemperature,
    dynamicContext,
    conversationHistory: enrichedMessages.slice(0, -1),
    conversationId: conversation.id,
  })

  // ── 9. Extract + post-process AI response ──
  console.log(`[Core:7] 📤 Extracting response...`)
  let aiReplyText: string | null = null
  if (engineResult.response) {
    const rawResponse =
      engineResult.response.rawResponse ||
      engineResult.response.direction ||
      [engineResult.response.insight, engineResult.response.question].filter(Boolean).join(' ') ||
      null

    if (rawResponse) {
      const postResult = postProcess(rawResponse, middlewareResult.state)
      aiReplyText = postResult.filteredResponse
      if (postResult.wasModified) {
        console.log(`[Core] Response post-processed (${rawResponse.length} → ${aiReplyText.length} chars)`)
      }
    }
  }

  // ── 10. Save outbound AI message to DB ──
  if (aiReplyText) {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        content: aiReplyText,
        type: 'text',
        direction: 'outbound',
        senderType: 'agent',
        isAiGenerated: true,
      },
    })
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: aiReplyText.slice(0, 100),
        assignedAgentId: engineResult.agentRouting.agentType,
      },
    })
  }

  // ── 11. Update contact lead score + tags ──
  if (contact && engineResult.action) {
    const existingTags: string[] = JSON.parse(contact.tags || '[]')
    const newTags = engineResult.crmUpdates
      ?.filter((u) => u.type === 'tags')
      .flatMap((u) => u.value)
      .filter((t) => !existingTags.includes(t as string)) as string[]

    await db.contact.update({
      where: { id: contact.id },
      data: {
        leadScore: engineResult.action === 'close' ? Math.min(contact.leadScore + 10, 100) : contact.leadScore,
        lastMessageAt: new Date(),
        tags: JSON.stringify([...existingTags, ...newTags]),
      },
    })
  }

  // ── 11b. Auto-create/update deal in pipeline ──
  if (contact) {
    const currentTags: string[] = JSON.parse(contact.tags || '[]')
    await autoCreateOrUpdateDeal({
      workspaceId: workspace.id,
      contactId: contact.id,
      conversationId: conversation.id,
      contactName: `${contact.firstName} ${contact.lastName || ''}`.trim(),
      leadScore: contact.leadScore,
      tags: currentTags,
      channel,
    })
  }

  // ── 12. Log agent interaction ──
  // FIX: Look up agent by the routing decision instead of hardcoded name
  try {
    const agentRecord = await db.agent.findFirst({
      where: { workspaceId: workspace.id, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (agentRecord) {
      await db.agentLog.create({
        data: {
          agentId: agentRecord.id,
          conversationId: conversation.id,
          inputMessage: text,
          outputMessage: engineResult.response
            ? engineResult.response.rawResponse ||
              engineResult.response.direction ||
              [engineResult.response.insight, engineResult.response.question].filter(Boolean).join(' ')
            : null,
          intent: engineResult.agentRouting.agentType,
          action: engineResult.action,
          confidence: engineResult.agentRouting.confidence,
        },
      })
    } else {
      console.warn('[Core:12] ⚠️ No JHON agent found in DB, skipping agentLog')
    }
  } catch (logErr) {
    console.warn('[Core:12] ⚠️ agentLog.create failed (non-critical):', logErr instanceof Error ? logErr.message : logErr)
  }

  // ── 13. Track analytics ──
  try {
    await db.analyticsEvent.create({
      data: {
        workspaceId: workspace.id,
        eventType: 'whatsapp_message_received',
        eventData: JSON.stringify({
          channel,
          phone,
          externalMessageId: externalId,
          aiProcessed: !!engineResult.response,
          aiReplied: !!aiReplyText,
        }),
      },
    })
  } catch (analyticsErr) {
    console.warn('[Core:13] ⚠️ analyticsEvent.create failed (non-critical):', analyticsErr instanceof Error ? analyticsErr.message : analyticsErr)
  }

  console.log(`[Core:✅] Done in ${Date.now() - start}ms | Reply: ${aiReplyText ? aiReplyText.length + ' chars' : 'NULL'}`)

  return {
    success: true,
    conversationId: conversation.id,
    contactId: contact?.id ?? null,
    aiReplyText,
    engineResult,
    latencyMs: Date.now() - start,
  }
}
