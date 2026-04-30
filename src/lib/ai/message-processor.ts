// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Central Message Processor
// SINGLE source of truth for: DB ops + AI pipeline + CRM updates
// Used by: connection.ts (WhatsApp), webhook, api/ai/chat
// ═══════════════════════════════════════════════════════════════

// ─── Personality Cache (Fix P1: avoid personality flip on hot-reload) ───
interface PersonalityCacheEntry {
  name: string
  temperature: number
  provider: string
  customPrompt: string
  dynamicContext: string
  workspaceId: string
  timestamp: number
}
import logger from '@/lib/logger'

const log = logger.child({ module: 'message-processor' })
const _personalityCache = new Map<string, PersonalityCacheEntry>()
const PERSONALITY_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

import { db } from '@/lib/db'
import { RevenueEngine, ClosingEngine, closingEngine } from '@/lib/ai'
import { preProcess, postProcess, injectContext } from '@/lib/ai/conversation-middleware'
import { enforceIdentity } from '@/lib/ai/humanizer'
import { ensureStateLoaded, persistState } from '@/lib/ai/conversation-state'
import { autoCreateOrUpdateDeal } from '@/lib/crm/auto-deal'
import { leadProfiler } from '@/lib/ai/lead-profiler'
import { normalizePhone } from '@/lib/utils'
import { notifyEvent } from '@/lib/telegram/notify'

// ─── Response deduplication cache (FIX: prevent duplicate responses) ───
// Stores last response per contact to avoid sending identical messages
// within a short window (e.g., rapid-fire messages from user)
const _lastResponseCache = new Map<string, { text: string; timestamp: number }>()
const RESPONSE_DEDUP_WINDOW_MS = 30_000 // 30 seconds

/**
 * Check if the given response is too similar to the last one sent to this contact.
 * Returns a fallback response if duplicate detected, null otherwise.
 */
function getDeduplicatedResponse(contactId: string, responseText: string): string | null {
  if (!contactId || !responseText) return null

  const cached = _lastResponseCache.get(contactId)
  if (!cached) return null

  const isExpired = Date.now() - cached.timestamp > RESPONSE_DEDUP_WINDOW_MS
  if (isExpired) return null

  // Check if the response is >= 80% similar to the last one
  const similarity = computeSimilarity(cached.text, responseText)
  if (similarity >= 0.8) {
    log.info(`[Dedup] Blocking duplicate response for contact ${contactId} (similarity: ${(similarity * 100).toFixed(0)}%)`)
    // Return a varied fallback instead of the duplicate
    const fallbacks = [
      '¿Necesitas algo más?',
      'Dime si tienes alguna otra duda 👍',
      'Con gusto te ayudo con lo que necesites.',
      '¿Qué te parece? ¿Tienes alguna pregunta?',
    ]
    return fallbacks[Math.floor(Math.random() * fallbacks.length)]
  }

  return null
}

/**
 * Update the dedup cache with the latest response.
 */
function updateDedupCache(contactId: string, responseText: string): void {
  if (!contactId || !responseText) return
  _lastResponseCache.set(contactId, { text: responseText, timestamp: Date.now() })

  // Cleanup old entries periodically (every 100 calls)
  if (_lastResponseCache.size > 500) {
    const now = Date.now()
    for (const [key, value] of _lastResponseCache) {
      if (now - value.timestamp > RESPONSE_DEDUP_WINDOW_MS * 2) {
        _lastResponseCache.delete(key)
      }
    }
  }
}

/**
 * Compute simple Jaccard similarity between two strings (word-level).
 */
function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/))
  const wordsB = new Set(b.toLowerCase().split(/\s+/))
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  return intersection / (wordsA.size + wordsB.size - intersection)
}

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

// ─── Safe JSON parse (FIX P1: prevent crashes with malformed data) ───
function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── PII masking (FIX P1: prevent phone numbers in logs) ───
function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '***'
  return phone.slice(0, 3) + '****' + phone.slice(-3)
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

  log.info(`[CORE 1] Iniciando procesamiento`)
  log.info(`[CORE 2] Mensaje: "${text.slice(0, 100)}"`)
  log.info(`[Core:1] 📩 Processing from ${maskPhone(phone)}: "${text.slice(0, 60)}"`)

  // ── FIX: Normalize phone number BEFORE any DB operation ──
  // This ensures consistent format regardless of how the phone arrives
  // (WhatsApp JID, webhook, manual input, CSV import, etc.)
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone !== phone) {
    log.info(`[Core:1] Phone normalized: "${phone}" → "${normalizedPhone}"`)
  }
  const safePhone = normalizedPhone

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
        log.warn(`[Core:1] Auto-reactivated workspace: ${anyWorkspace.name}`)
      }
    }
  }
  if (!workspace) {
    throw new Error('No workspace found')
  }
  log.info(`[Core:2] ✅ Workspace: ${workspace.name}`)

  // ── 2. Find or create contact (FIX P0: atomic upsert) ──
  // Uses DB-level unique constraint on (workspaceId, phone) to prevent
  // race-condition duplicates. Two concurrent requests for the same phone
  // cannot both create contacts — one will upsert, the other will update.
  let contact
  if (forcedContactId) {
    contact = await db.contact.findUnique({ where: { id: forcedContactId } })
  } else if (safePhone) {
    contact = await db.contact.upsert({
      where: {
        contact_workspace_phone_key: { workspaceId: workspace.id, phone: safePhone },
      },
      update: {
        lastMessageAt: new Date(),
        // Re-activate archived contacts on new message
        status: 'active',
        // Update name if we have a better one (pushName from WhatsApp)
        ...(pushName && pushName.length >= 2 && pushName !== 'Contacto WhatsApp'
          ? { firstName: pushName }
          : {}),
      },
      create: {
        workspaceId: workspace.id,
        firstName: pushName || 'Contacto WhatsApp',
        phone: safePhone,
        source: channel,
        tags: JSON.stringify(['whatsapp_incoming']),
      },
    })
    // FIX: Notify admin via Telegram when a new contact is created
    notifyEvent('new_lead', {
      phone: safePhone,
      name: pushName || 'Contacto WhatsApp',
      source: channel,
    }).catch(() => {})
  } else {
    // No phone number — fallback to findFirst (shouldn't happen for WhatsApp)
    contact = await db.contact.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
    })
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
    log.info(`[Core] skipAI=true, skipping AI pipeline for media message`)
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
  log.info(`[Core:5] 🔄 Pre-processing...`)
  
  // FIX P0.1: Load conversation state from DB (L2) into L1 cache before processing
  if (contact?.id) {
    await ensureStateLoaded(phone, contact.id)
  }
  
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

  // ── 7b. DIB: Silent Lead Profiling (non-blocking) ──
  let leadProfileContext: string | undefined
  if (contact) {
    try {
      // Get messages with timestamps for avg response time calculation
      const messagesWithDates = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { content: true, senderType: true, createdAt: true },
      })

      const profiledMessages = messagesWithDates.map((m) => ({
        role: m.senderType === 'contact' ? 'user' : 'assistant',
        content: m.content,
        createdAt: m.createdAt,
      }))

      const profile = await leadProfiler.profileContact({
        contactId: contact.id,
        workspaceId: workspace.id,
        messageText: text,
        allMessages: profiledMessages,
        currentScore: contact.leadScore,
      })

      if (profile) {
        leadProfileContext = leadProfiler.buildProfileContext(profile)
        log.info(`[Core:DIB] Profile built: archetype=${profile.archetype} temp=${profile.temperature}`)
      }
    } catch (profileErr) {
      log.warn({ err: profileErr instanceof Error ? profileErr.message : profileErr }, '[Core:DIB] Lead profiling failed (non-critical)')
    }
  }

  // ── 7c. APPOINTMENT CONTEXT INJECTION (FIX: prevent forgetting scheduled appointments) ──
  // Check if this contact has any upcoming appointments and inject them into the context
  // so the LLM remembers to reference them when the user returns to the conversation.
  let dynamicContext = '' // Declared here so appointment context can be appended before workspace settings load
  if (contact?.id) {
    try {
      const upcomingAppointments = await db.appointment.findMany({
        where: {
          contactId: contact.id,
          status: 'pending',
          date: { gte: new Date() }, // Only future appointments
        },
        orderBy: { date: 'asc' },
        take: 3,
      })

      if (upcomingAppointments.length > 0) {
        const appointmentLines = upcomingAppointments.map((apt) => {
          const aptDate = new Date(apt.date)
          const dateStr = aptDate.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })
          return `- ${apt.title} agendada para el ${dateStr} (${apt.duration} min)`
        })

        const appointmentContext = `CITAS PENDIENTES DEL CONTACTO:\n${appointmentLines.join('\n')}\nIMPORTANTE: Si el contact pregunta sobre tus servicios o productos, recuérdales estas citas y ofrece adelantarlas si es necesario. NO vuelvas a presentarte ni actúes como si fuera una conversación nueva.`

        // Append to dynamicContext (will be prepended to the system prompt)
        dynamicContext = dynamicContext
          ? `${appointmentContext}\n\n${dynamicContext}`
          : appointmentContext

        log.info(`[Core:7c] Injected ${upcomingAppointments.length} upcoming appointment(s) into context`)
      }
    } catch (aptErr) {
      log.warn({ err: aptErr instanceof Error ? aptErr.message : aptErr }, '[Core:7c] Appointment context failed (non-critical)')
    }
  }

  // ── 8. Revenue Engine (AI pipeline) ──
  log.info(`[CORE 3] Historial length: ${enrichedMessages.length} mensajes`)  
  log.info(`[Core:6] 🤖 RevenueEngine (${enrichedMessages.length} messages)...`)

  // Read workspace AI settings — FIX P1: Use personality cache to avoid
  // personality flip during hot-reloads. Cache persists across requests for 5 min.
  let personalityName = 'JHON'
  let aiTemperature = 0.75
  let aiProvider = 'glm'
  let customSystemPrompt = ''
  // dynamicContext already declared above (line 381) for appointment context injection
  try {
    const cacheKey = workspace.id
    const cached = _personalityCache.get(cacheKey)
    const now = Date.now()

    if (cached && cached.workspaceId === workspace.id && (now - cached.timestamp) < PERSONALITY_CACHE_TTL) {
      // Use cached personality settings (prevents flip during hot-reload)
      personalityName = cached.name
      aiTemperature = cached.temperature
      aiProvider = cached.provider
      customSystemPrompt = cached.customPrompt
      dynamicContext = cached.dynamicContext
      log.info(`[AI] Using cached personality: ${personalityName} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`)
    } else {
      // Cache miss or expired — read from workspace settings
      const wsSettings = typeof workspace.settings === 'string'
        ? JSON.parse(workspace.settings || '{}')
        : (workspace.settings || {})

      if (wsSettings.defaultPersonality) personalityName = wsSettings.defaultPersonality
      if (wsSettings.aiTemperature !== undefined) aiTemperature = wsSettings.aiTemperature
      if (wsSettings.apiProvider) aiProvider = wsSettings.apiProvider
      if (wsSettings.customSystemPrompt) customSystemPrompt = wsSettings.customSystemPrompt
      if (wsSettings.dynamicContext) dynamicContext = wsSettings.dynamicContext

      // Update cache
      _personalityCache.set(cacheKey, {
        name: personalityName,
        temperature: aiTemperature,
        provider: aiProvider,
        customPrompt: customSystemPrompt,
        dynamicContext,
        workspaceId: workspace.id,
        timestamp: now,
      })
      log.info(`[AI] Personality loaded and cached: ${personalityName}`)
    }
  } catch (e) {
    log.warn({ err: e }, '[AI] Could not parse workspace settings')
  }

  const engine = new RevenueEngine()
  // FIX: Wrap RevenueEngine call in try-catch for Telegram LLM failure alerts
  let engineResult
  try {
    engineResult = await engine.processConversation({
    messages: enrichedMessages,
    contactData: contact
      ? {
          name: `${contact.firstName} ${contact.lastName || ''}`.trim(),
          source: contact.source,
          createdAt: contact.createdAt,
          tags: safeJsonParse(contact.tags, [] as string[]),
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
    leadProfileContext, // DIB: pass profile context for personalization
  })
  } catch (llmErr) {
    // FIX: Notify admin via Telegram on LLM failure — fire and forget
    notifyEvent('llm_failure', {
      phone: safePhone,
      error: llmErr instanceof Error ? llmErr.message : String(llmErr),
    }).catch(() => {})
    throw llmErr // re-throw so the caller can handle it
  }

  // ── 8.5 CLOSING ENGINE INTEGRATION ──
  // When RevenueEngine decides to close (action='close') and lead score >= 50,
  // use ClosingEngine for specialized closing-technique intelligence.
  // The ClosingEngine assesses deal closability, selects the best technique
  // (alternative, urgency, assumptive, summary, testimonial, FOMO, etc.),
  // and optionally generates a technique-specific LLM message.
  if (
    engineResult.action === 'close' &&
    engineResult.response &&
    contact
  ) {
    try {
      const closingAssessment = closingEngine.assessDealClosability(
        { score: contact.leadScore ?? 0, stage: contact.stage ?? 'new' },
        enrichedMessages
      )

      log.info(
        `[Core:8.5] ClosingEngine activated — closability: ${closingAssessment.closabilityScore}/100, technique: ${closingAssessment.recommendedTechnique}`
      )

      // FIX: Notify admin via Telegram when closing engine activates
      notifyEvent('closing_attempt', {
        phone: safePhone,
        closability: closingAssessment.closabilityScore,
        technique: closingAssessment.recommendedTechnique,
      }).catch(() => {})

      // Store technique metadata in urgencyBoost (NOT in the user-facing response)
      // The frontend/dashboard can display this; the WhatsApp message stays clean
      if (closingAssessment.closabilityScore >= 40) {
        if (engineResult.response.urgencyBoost) {
          engineResult.response.urgencyBoost += ` | ${closingAssessment.recommendedTechnique} (closability: ${closingAssessment.closabilityScore})`
        } else {
          engineResult.response.urgencyBoost = `${closingAssessment.recommendedTechnique} (closability: ${closingAssessment.closabilityScore})`
        }
      }
    } catch (closingErr) {
      // Non-fatal: ClosingEngine enrichment is additive, not required
      log.warn({ err: closingErr instanceof Error ? closingErr.message : closingErr }, '[Core:8.5] ClosingEngine enrichment failed (non-fatal)')
    }
  }

  // ── 9. Extract + post-process AI response ──
  log.info(`[Core:7] 📤 Extracting response...`)
  let aiReplyText: string | null = null
  if (engineResult.response) {
    const rawResponse =
      engineResult.response.rawResponse ||
      engineResult.response.direction ||
      [engineResult.response.insight, engineResult.response.question].filter(Boolean).join(' ') ||
      null

    if (rawResponse) {
      // FIX: Enforce Jhon identity on raw text BEFORE any post-processing
      // This ensures both the DB-saved text and the API response are correct
      const identityCleaned = enforceIdentity(rawResponse)

      const postResult = postProcess(identityCleaned, middlewareResult.state)
      let finalResponse = postResult.filteredResponse

      // Second pass: enforce identity again after post-processing
      finalResponse = enforceIdentity(finalResponse)

      aiReplyText = finalResponse

      // ── 8.7 RESPONSE DEDUPLICATION (FIX: prevent duplicate responses) ──
      // Check if this response is too similar to the last one sent to this contact
      // within the last 30 seconds. If so, replace with a varied fallback.
      if (contact?.id && aiReplyText) {
        const dedupResult = getDeduplicatedResponse(contact.id, aiReplyText)
        if (dedupResult) {
          aiReplyText = dedupResult
          log.info(`[Core:8.7] Response deduplicated — using fallback instead`)
        } else {
          updateDedupCache(contact.id, aiReplyText)
        }
      }

      // Also fix the engineResult so the API response reflects the corrected identity
      if (engineResult.response?.rawResponse) {
        engineResult.response.rawResponse = enforceIdentity(engineResult.response.rawResponse)
      }
      if (engineResult.response?.insight) {
        engineResult.response.insight = enforceIdentity(engineResult.response.insight)
      }

      if (postResult.wasModified || finalResponse !== rawResponse) {
        log.info(`[Core] Response post-processed (${rawResponse.length} → ${aiReplyText.length} chars)`)
      }
    }
  }

  // ── 9.5 FIX P0.1: Persist conversation state to L2 (AgentMemory) ──
  if (contact?.id) {
    await persistState(phone).catch(() => {
      // Non-fatal: L1 cache still works
    })
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
        // NOTE: assignedAgentId stores the agent TYPE string (e.g. 'sales', 'qualifier'),
        // not an actual agent ID. This is a legacy naming issue — the field should be
        // called assignedAgentType. Kept as-is to avoid DB migration.
        assignedAgentId: engineResult.agentRouting.agentType,
      },
    })
  }

  // ── 11. Update contact lead score + tags ──
  if (contact && engineResult.action) {
    const existingTags: string[] = safeJsonParse(contact.tags, [] as string[])
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

    // FIX: Notify admin via Telegram when lead score goes above 80 (hot lead)
    const updatedScore = engineResult.action === 'close'
      ? Math.min(contact.leadScore + 10, 100)
      : contact.leadScore
    if (updatedScore > 80) {
      notifyEvent('hot_lead', {
        phone: safePhone,
        score: updatedScore,
        name: `${contact.firstName} ${contact.lastName || ''}`.trim(),
      }).catch(() => {})
    }
  }

  // ── 11b. Auto-create/update deal in pipeline ──
  if (contact) {
    const currentTags: string[] = safeJsonParse(contact.tags, [] as string[])
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
  // FIX: Look up agent by the routing decision's agentType, not just the first active one
  try {
    const routedAgentType = engineResult.agentRouting.agentType // e.g. 'qualifier', 'sales', 'followup'
    const agentRecord = await db.agent.findFirst({
      where: {
        workspaceId: workspace.id,
        isActive: true,
        type: routedAgentType, // Match by the type the router selected
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    // Fallback: if no agent matches the routed type, use any active agent
    const fallbackAgent = !agentRecord
      ? await db.agent.findFirst({
          where: { workspaceId: workspace.id, isActive: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      : null
    const activeAgent = agentRecord ?? fallbackAgent
    if (activeAgent) {
      await db.agentLog.create({
        data: {
          agentId: activeAgent.id,
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
      log.warn('[Core:12] ⚠️ No JHON agent found in DB, skipping agentLog')
    }
  } catch (logErr) {
    log.warn({ err: logErr instanceof Error ? logErr.message : logErr }, '[Core:12] ⚠️ agentLog.create failed (non-critical)')
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
    log.warn({ err: analyticsErr instanceof Error ? analyticsErr.message : analyticsErr }, '[Core:13] ⚠️ analyticsEvent.create failed (non-critical)')
  }

  // ── 14. Persist follow-up tasks to DB ──
  // FIX: Follow-up tasks were generated by RevenueEngine but never saved.
  // Now we create FollowUpTask records linked to an auto-generated rule.
  if (
    engineResult.followUpTasks &&
    engineResult.followUpTasks.length > 0 &&
    contact &&
    conversation
  ) {
    try {
      // Find or create a system follow-up rule for this workspace
      let systemRule = await db.followUpRule.findFirst({
        where: {
          workspaceId: workspace.id,
          triggerType: 'scheduled',
          isActive: true,
        },
        select: { id: true },
      })

      if (!systemRule) {
        // Create a default system rule for AI-generated follow-ups
        const createdRule = await db.followUpRule.create({
          data: {
            workspaceId: workspace.id,
            name: 'AI Auto Follow-up',
            description: 'Automatically generated follow-up tasks from RevenueEngine',
            triggerType: 'scheduled',
            channel: 'whatsapp',
            messageTemplate: '',
            isActive: true,
            maxRetries: 2,
            cooldownHours: 24,
            priority: 5,
          },
          select: { id: true },
        })
        systemRule = createdRule
      }

      // Create a FollowUpTask record for each generated task (skip immediate/0h tasks)
      const tasksToPersist = engineResult.followUpTasks.filter((t) => t.delayHours > 0)
      for (const task of tasksToPersist.slice(0, 3)) {
        const scheduledAt = new Date(Date.now() + task.delayHours * 60 * 60 * 1000)
        await db.followUpTask.create({
          data: {
            workspaceId: workspace.id,
            ruleId: systemRule.id,
            contactId: contact.id,
            conversationId: conversation.id,
            status: 'pending',
            scheduledAt,
          },
        })
      }

      log.info(`[Core:14] ✅ Persisted ${tasksToPersist.length} follow-up tasks to DB`)
    } catch (followUpErr) {
      log.warn({ err: followUpErr instanceof Error ? followUpErr.message : followUpErr }, '[Core:14] ⚠️ FollowUpTask persistence failed (non-critical)')
    }
  }

  log.info(`[Core:✅] Done in ${Date.now() - start}ms | Reply: ${aiReplyText ? aiReplyText.length + ' chars' : 'NULL'}`)

  return {
    success: true,
    conversationId: conversation.id,
    contactId: contact?.id ?? null,
    aiReplyText,
    engineResult,
    latencyMs: Date.now() - start,
  }
}
