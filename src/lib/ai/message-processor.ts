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
  businessAddress?: string
  businessPhone?: string
  businessHours?: string
  appointmentUrl?: string
}
const _personalityCache = new Map<string, PersonalityCacheEntry>()
const PERSONALITY_CACHE_TTL = 60 * 1000 // 60 seconds (spec: TTL 60s)

/** Called by /api/developer/prompts after saving to AgentPersona so the next
 *  message uses the new prompt immediately (no 5-min cache lag). */
export function invalidatePersonalityCache(workspaceId: string): void {
  _personalityCache.delete(workspaceId)
}

/**
 * extractFinalResponse — FIX P0: Strip AI chain-of-thought analysis from reply.
 *
 * The LLM sometimes returns reasoning prefixes like:
 *   "Output Generation: ..." / "Draft: ..." / "Analyze: ..." / step-by-step thinking
 *
 * This function extracts ONLY the final customer-facing message.
 * Strategy:
 *   1. Look for "Output Generation:" marker → take everything after it
 *   2. Fall back to last non-empty line that doesn't look like internal analysis
 *   3. Final fallback: return the full response as-is
 */
export function extractFinalResponse(raw: string): string {
  if (!raw || raw.trim().length === 0) return raw

  // 0. Strip inline reasoning leaks wrapped in *asterisks* or _underscores_.
  // The bot answers in Spanish, so an English meta-aside like
  //   *Wait, is asking for RFC too much for a "demo call"?*
  // is the model's own thinking, not a reply. We only remove asterisk/underscore
  // segments that START with a known reasoning marker, so legitimate WhatsApp
  // *bold* (e.g. *$2,400/mes*) is preserved.
  const REASONING_ASIDE =
    /[*_]+\s*(?:wait|hmm+|actually|let me|let's|okay|ok so|hold on|i think|i should|i need to|i'?ll|maybe|but wait|so,|is (?:asking|this)|should i|the user|note to self|on second thought)\b[^*_\n]*[*_]+/gi
  raw = raw.replace(REASONING_ASIDE, ' ').replace(/[ \t]{2,}/g, ' ').trim()
  if (!raw) return ''

  // 1. Explicit "Output Generation:" marker (chain-of-thought pattern)
  const outputMarker = /Output\s+Generation\s*:\s*/i
  const markerMatch = raw.match(outputMarker)
  if (markerMatch && markerMatch.index !== undefined) {
    const afterMarker = raw.slice(markerMatch.index + markerMatch[0].length).trim()
    if (afterMarker.length > 0) return afterMarker
  }

  // 2. Lines that signal analysis (skip them, find clean lines)
  const analysisPatterns = [
    /^(Draft|Analyze|Analysis|Reasoning|Thinking|Step \d|Chain|Let me|Primero|Analizando|Reviso|Considerando)\s*[:—]/i,
    /^(Output|Response|Final|Answer)\s*[:—]/i,
    // English reasoning leaks (bot replies in Spanish, so these are internal)
    /^(Wait|Hmm+|Actually|Okay|OK|Hold on|I think|I should|I need to|I'?ll|Maybe|But wait|The user|Let's|So),?\s/i,
  ]

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

  // Only engage line-stripping if the text ACTUALLY contains analysis/reasoning
  // lines. Otherwise a normal multi-line WhatsApp reply (e.g. product card +
  // question, or a financing quote spanning several lines) would be mangled.
  // BUG FIX: the old logic scanned from the end and returned `lines.slice(i)`
  // at the first clean line — which, scanning backwards, is the LAST line — so
  // it silently dropped everything except the final line of clean replies.
  const hasAnalysis = lines.some(l => analysisPatterns.some(p => p.test(l)))
  if (!hasAnalysis) return raw.trim()

  // Remove ONLY the analysis lines, preserving the order of the real content.
  const clean = lines.filter(l => !analysisPatterns.some(p => p.test(l))).join('\n').trim()
  if (clean.length > 5) return clean

  // 3. Fallback: return as-is
  return raw.trim()
}

import { db } from '@/lib/db'
import { RevenueEngine } from '@/lib/ai'
import { clientWritesEnglish, type IntentEnum } from '@/lib/ai/revenue-engine'
import { preProcess, postProcess, injectContext } from '@/lib/ai/conversation-middleware'
import { autoCreateOrUpdateDeal } from '@/lib/crm/auto-deal'
import { buildContactInfoUpdate, extractContactInfoFromText } from '@/lib/crm/contact-info-extractor'
import { leadProfiler } from '@/lib/ai/lead-profiler'
import type { LeadProfileData } from '@/lib/ai/lead-profiler'
import { recordProfileTimeline, recordAppointmentTimeline, maybeWriteAiSummary, logTimelineEvent } from '@/lib/erp/bitacora'
import { sendAppointmentConfirmationEmail } from '@/lib/email'
import { PLANS } from '@/lib/constants'
import { aiUsageWindowStart } from '@/lib/api-auth'
import { loadWorkspaceModules, composePrompt, buildModuleContext, loadHooksBlock, loadTrainingBlock, loadKnowledgeBlock } from '@/lib/ai/prompt-composer'
import { buildIndustryPersona } from '@/lib/ai/industries'
import { getFinancingConfig, computeAutoQuote, formatQuoteMessage } from '@/lib/finance/auto-credit'
import { tzFromSettings, zonedNaiveToUtc } from '@/lib/timezone'
import type { PhysicalLocationConfig, AgentProfileConfig } from '@/lib/ai/prompt-composer'
import type { Channel } from '@/lib/types'
import { selectAgentForConversation, type AgentRouteResult } from '@/lib/ai/agent-selector'
import { publish } from '@/lib/event-bus'
import { sanitizeContactName } from '@/lib/contact-name'
import { parseCRMActions, stripCRMActions, buildCRMToolsInstruction } from '@/lib/ai/crm-tool-parser'
import { createTenantPaymentLink, createTenantInvoice } from '@/lib/erp/payments'
import { computeLeadScoreDelta, buildIntentActionDirective } from '@/lib/ai'
import { canUseTool, canRunTool } from '@/lib/ai/agent-permissions'
import { buildTrackedQuoteLink } from '@/lib/tracking'
import { getAgentForContact } from '@/lib/ai/agent-router'
import { broadcastToWorkspace, sendTelegramNotification } from '@/lib/telegram'
import { notifyHotLead, notifyAppointmentBooked, notifyHumanEscalation } from '@/lib/telegram-events'

function parseContactCustomFields(raw?: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function persistAppointmentEmailStatus(contactId: string, status: Record<string, unknown>): Promise<void> {
  const existing = await db.contact.findUnique({
    where: { id: contactId },
    select: { customFields: true },
  })
  if (!existing) return
  const customFields = parseContactCustomFields(existing.customFields)
  customFields.ultima_confirmacion_cita_email = status
  await db.contact.update({
    where: { id: contactId },
    data: { customFields: JSON.stringify(customFields) },
  })
}

async function sendAppointmentConfirmationIfPossible(input: {
  contactId?: string | null
  contactName: string
  businessName: string
  title: string
  date: Date
  durationMinutes: number
  type: string
  appointmentId: string
}): Promise<void> {
  if (!input.contactId) return

  const latestContact = await db.contact.findUnique({
    where: { id: input.contactId },
    select: { email: true, firstName: true, lastName: true },
  })
  const email = latestContact?.email?.trim()
  if (!email) {
    await persistAppointmentEmailStatus(input.contactId, {
      status: 'skipped',
      reason: 'contact_without_email',
      appointmentId: input.appointmentId,
      at: new Date().toISOString(),
    })
    console.log(`[Core:AppointmentEmail] Skipped confirmation email for ${input.contactId}: no email`)
    return
  }

  try {
    const name = `${latestContact?.firstName || ''} ${latestContact?.lastName || ''}`.trim() ||
      input.contactName ||
      'Cliente'
    await sendAppointmentConfirmationEmail({
      to: email,
      name,
      businessName: input.businessName,
      title: input.title,
      date: input.date,
      durationMinutes: input.durationMinutes,
      type: input.type,
    })
    await persistAppointmentEmailStatus(input.contactId, {
      status: 'sent',
      to: email,
      appointmentId: input.appointmentId,
      at: new Date().toISOString(),
    })
    console.log(`[Core:AppointmentEmail] Confirmation sent to ${email} for appointment ${input.appointmentId}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    await persistAppointmentEmailStatus(input.contactId, {
      status: 'failed',
      to: email,
      appointmentId: input.appointmentId,
      error: message,
      at: new Date().toISOString(),
    })
    console.warn(`[Core:AppointmentEmail] Could not send confirmation email to ${email}: ${message}`)
  }
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
  /**
   * When true, the `text` was authored by a HUMAN OPERATOR in the
   * inbox (NOT received from the customer on a webhook). The
   * processor still runs the AI pipeline so the assistant can
   * produce its own reply, but the operator's text is NEVER saved
   * as `direction='inbound' / senderType='contact'` — that is the
   * responsibility of the caller (e.g. /api/whatsapp/send already
   * persisted it as outbound/human).
   *
   * Internally this behaves the same as `skipMessageSave=true`.
   * Kept as a separate field for caller intent — the operator-initiated
   * case is semantically different from "the webhook saved it for us".
   */
  operatorInitiated?: boolean
  /** Message type: text, image, video, audio, document, sticker, location, contact */
  messageType?: string
  /** Skip AI processing (e.g., for media-only messages without text) */
  skipAI?: boolean
  /**
   * Contexto del ANUNCIO de origen (chats que nacen de un Facebook/Instagram
   * Ad — CTWA). WhatsApp lo adjunta al primer mensaje como externalAdReply.
   * Se persiste en el contacto y se inyecta al prompt para que la apertura
   * del bot use el contexto real ("vi que llegaste desde nuestro anuncio…").
   */
  adContext?: { title?: string; body?: string; sourceUrl?: string }
}

const SUPPORTED_CHANNELS = new Set<Channel>(['whatsapp', 'telegram', 'instagram', 'webchat'])

function normalizeChannel(value: string): Channel {
  const normalized = value.trim().toLowerCase()
  if (!SUPPORTED_CHANNELS.has(normalized as Channel)) {
    throw new Error(`[CORE] Unsupported channel: ${value}`)
  }
  return normalized as Channel
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
  /** CRM tags parsed from AI response (type + value) */
  parsedCRMTags?: Array<{ type: string; value: string }>
  /** Current appointment proposal state from conversation.metadata */
  apptMetadata?: { proposedDate?: string; time1?: string; time2?: string; proposedAt?: string } | null
  /** Set when an appointment was just confirmed in THIS message, so the
   *  channel can send an "add to calendar" link as a separate message. */
  appointmentBooked?: { title: string; date: string; durationMin: number } | null
  /** Fotos/video del catálogo a enviar como mensajes aparte tras el texto. */
  mediaToSend?: { images: string[]; video?: string | null; caption?: string } | null
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
    channel: rawChannel = 'whatsapp',
    workspaceId: forcedWorkspaceId,
    conversationId: forcedConversationId,
    contactId: forcedContactId,
    skipMessageSave = false,
    operatorInitiated = false,
    messageType = 'text',
    skipAI = false,
    adContext,
  } = input

  // Operator-typed text must NEVER be persisted as an inbound message
  // from the contact. The caller (e.g. /api/whatsapp/send) already saved
  // it correctly as outbound/human. Keep them in sync — they are two
  // sides of the same coin.
  const shouldSkipInboundSave = skipMessageSave || operatorInitiated

  console.log(`[CORE 1] Iniciando procesamiento`)
  console.log(`[CORE 2] Mensaje: "${text.slice(0, 100)}"`)
  console.log(`[Core:1] 📩 Processing from ${phone}: "${text.slice(0, 60)}"`)

  const channel = normalizeChannel(rawChannel)

  // ── 1. Resolve workspace ──
  // STRICT MULTI-TENANT: workspaceId MUST be supplied by the caller.
  // Auto-detect fallbacks (findFirst, "any active workspace", phone matching)
  // are intentionally removed — they were the root cause of incoming
  // messages from one tenant's phone being processed under another tenant's
  // workspace. If no workspaceId is provided, we refuse to process.
  let workspace
  if (forcedWorkspaceId) {
    workspace = await db.workspace.findUnique({ where: { id: forcedWorkspaceId } })
  }
  if (!workspace) {
    throw new Error(
      `No workspace found: [CORE] refusing to process message without an explicit workspaceId. ` +
      `Caller must pass workspaceId resolved from the authenticated channel/session. ` +
      `(forcedWorkspaceId="${forcedWorkspaceId ?? ''}")`
    )
  }
  console.log(`[Core:2] ✅ Workspace: ${workspace.name} (${workspace.id})`)

  // ── 2. Find or create contact (FIX P0: atomic upsert) ──
  // Uses DB-level unique constraint on (workspaceId, phone) to prevent
  // race-condition duplicates. Two concurrent requests for the same phone
  // cannot both create contacts — one will upsert, the other will update.
  let contact
  if (forcedContactId) {
    contact = await db.contact.findUnique({ where: { id: forcedContactId } })
  } else if (phone) {
    contact = await db.contact.upsert({
      where: {
        contact_workspace_phone_key: { workspaceId: workspace.id, phone },
      },
      update: {
        lastMessageAt: new Date(),
        // Re-activate archived contacts on new message
        status: 'active',
        // Update name if we have a better one (pushName SANEADO — sin emojis/símbolos)
        ...((() => { const n = sanitizeContactName(pushName); return n && n !== 'Contacto WhatsApp' ? { firstName: n } : {} })()),
      },
      create: {
        workspaceId: workspace.id,
        firstName: sanitizeContactName(pushName) || 'Contacto WhatsApp',
        phone,
        source: channel,
        tags: JSON.stringify(['whatsapp_incoming']),
      },
    })
  } else {
    // No phone number — fallback to findFirst (shouldn't happen for WhatsApp)
    contact = await db.contact.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
    })
  }

  // Perfiles UNIFICADOS: si este contacto fue fusionado en otro (multi-canal),
  // sigue el puntero para que la conversación viva en el expediente unificado.
  if (contact) {
    try {
      const cfPtr = JSON.parse(contact.customFields || '{}') as Record<string, unknown>
      if (cfPtr.mergedInto && typeof cfPtr.mergedInto === 'string') {
        const unified = await db.contact.findUnique({ where: { id: cfPtr.mergedInto } })
        if (unified) {
          console.log(`[Core] Contacto ${contact.id} fusionado → usando expediente unificado ${unified.id}`)
          contact = unified
        }
      }
    } catch { /* no crítico */ }
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
  if (!shouldSkipInboundSave) {
    const savedInbound = await db.message.create({
      data: {
        conversationId: conversation.id,
        content: text,
        type: messageType,
        direction: 'inbound',
        senderType: 'contact',
        externalId,
      },
    })
    // Vincula el media de WhatsApp (descargado en paralelo, sin messageId) a este mensaje,
    // para que las imágenes/audios/documentos se muestren en la conversación.
    if (externalId) {
      await db.mediaFile.updateMany({
        where: { workspaceId: conversation.workspaceId, messageId: null, metadata: { contains: `"waMsgKey":"${externalId}"` } },
        data: { messageId: savedInbound.id, conversationId: conversation.id },
      }).catch(() => {})
    }
    // Event Bus: mensaje entrante real (lo consume el ticker "EVENT BUS EN VIVO" vía SSE)
    publish('message.received', {
      messageId: savedInbound.id,
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      channel: (conversation as { channel?: string }).channel || 'whatsapp',
      content: text,
    })
  } else if (operatorInitiated) {
    console.log(`[Core:4] ⏭️  Skipping inbound save (operatorInitiated=true) — text was already persisted as outbound/human by caller`)
  }

  // ── 5. Update conversation timestamp ──
  await db.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 100) },
  })

  // ── 5b. Persist contact info mentioned by the lead ──
  // Keep standard fields (name/email) and structured customFields updated from
  // incoming text, independent from AI CRM tags.
  // Skip when the text was authored by an operator (not the contact) — we
  // never want to overwrite a contact's email/name from the operator's words.
  if (contact && text.trim() && !operatorInitiated) {
    try {
      const extractedInfo = extractContactInfoFromText(text)
      const contactUpdate = buildContactInfoUpdate(contact, extractedInfo)
      if (Object.keys(contactUpdate.data).length > 0) {
        contact = await db.contact.update({
          where: { id: contact.id },
          data: contactUpdate.data,
        })
        console.log(`[Core:ContactInfo] Updated ${contactUpdate.changedFields.join(', ')} for contact ${contact.id}`)
      }

      // UNIFICACIÓN MULTI-CANAL: si el cliente dio su teléfono o correo y
      // coincide EXACTO con otro contacto del workspace, se fusionan en un
      // solo expediente (el hilo de IG/FB/Telegram/Web se une al de WhatsApp).
      if (contact && (extractedInfo.statedPhone || extractedInfo.email)) {
        try {
          const { maybeUnifyContact } = await import('@/lib/crm/contact-merge')
          const res = await maybeUnifyContact({
            workspaceId: workspace.id, contactId: contact.id, channel,
            statedPhone: extractedInfo.statedPhone,
          })
          if (res.merged && res.targetId) {
            const unified = await db.contact.findUnique({ where: { id: res.targetId } })
            if (unified) contact = unified
            console.log(`[Core:ContactInfo] Contacto unificado en ${res.targetId} (${res.targetName})`)
          }
        } catch { /* no crítico */ }
      }
    } catch (infoErr) {
      console.warn('[Core:ContactInfo] Could not persist detected contact info:', infoErr instanceof Error ? infoErr.message : infoErr)
    }
  }

  // ── 6. Skip AI for media-only messages or disabled AI auto-reply ──
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

  // ── PAUSA GLOBAL de la IA (switch del tablero, pedido de Jhon 2026-07-14) ──
  // Apaga TODO el bot del workspace por 1h/3h o indefinido. El mensaje entrante
  // YA quedó guardado (el CRM no pierde nada); solo se omite la respuesta.
  // Con vencimiento pasado se limpia sola y el pipeline continúa.
  try {
    const gs = JSON.parse(workspace.settings || '{}') as Record<string, unknown>
    const gUntil = gs.aiGlobalPausedUntil ? new Date(String(gs.aiGlobalPausedUntil)) : null
    const untilActive = !!(gUntil && !isNaN(gUntil.getTime()) && gUntil.getTime() > Date.now())
    const untilExpired = !!(gUntil && !isNaN(gUntil.getTime()) && gUntil.getTime() <= Date.now())
    if (untilExpired) {
      delete gs.aiGlobalPausedUntil
      gs.aiGlobalPaused = false
      await db.workspace.update({ where: { id: workspace.id }, data: { settings: JSON.stringify(gs) } }).catch(() => {})
      console.log(`[Core] Pausa GLOBAL de IA vencida — bot reactivado solo (ws ${workspace.id})`)
    } else if (gs.aiGlobalPaused === true || untilActive) {
      console.log(`[Core] IA GLOBAL en pausa (ws ${workspace.id}${gUntil ? ` hasta ${gUntil.toISOString()}` : ' — indefinida'}) — mensaje guardado, sin respuesta automática`)
      return {
        success: true,
        conversationId: conversation.id,
        contactId: contact?.id ?? null,
        aiReplyText: null,
        engineResult: null as any,
        latencyMs: Date.now() - start,
      }
    }
  } catch { /* no crítico */ }

  // Check per-conversation manual mode (aiDisabled flag in metadata)
  {
    let convMeta: Record<string, unknown> = {}
    try { convMeta = JSON.parse(conversation.metadata || '{}') } catch { convMeta = {} }

    // Check contact-level aiDisabled (PRIMARY — channel/status independent)
    // Stored in contact.customFields so it survives conversation recreations,
    // channel switches (whatsapp vs webchat), and status changes (closed→active).
    let contactCF: Record<string, unknown> = {}
    try { contactCF = JSON.parse((contact as any)?.customFields || '{}') } catch {}

    if (contactCF.aiDisabled === true || convMeta.aiDisabled === true) {
      // Pausa TEMPORAL (botón "Pausar bot 1h/3h/24h" del inbox): si aiPausedUntil
      // ya venció, la IA se REACTIVA SOLA — se limpia la bandera y el pipeline
      // continúa normal. Sin aiPausedUntil = Manual indefinido (comportamiento previo).
      const untilRaw = (contactCF.aiPausedUntil || convMeta.aiPausedUntil) as string | undefined
      const until = untilRaw ? new Date(untilRaw) : null
      const pauseExpired = !!(until && !isNaN(until.getTime()) && until.getTime() <= Date.now())

      if (pauseExpired) {
        console.log(`[Core] Pausa del bot VENCIDA (${untilRaw}) para contact ${contact?.id ?? 'unknown'} — IA reactivada sola`)
        try {
          if (contact && (contactCF.aiDisabled === true || contactCF.aiPausedUntil)) {
            const newCF: Record<string, unknown> = { ...contactCF, aiDisabled: false }
            delete newCF.aiPausedUntil
            await db.contact.update({ where: { id: contact.id }, data: { customFields: JSON.stringify(newCF) } })
          }
          if (convMeta.aiDisabled === true || convMeta.aiPausedUntil) {
            const newMeta: Record<string, unknown> = { ...convMeta, aiDisabled: false }
            delete newMeta.aiPausedUntil
            await db.conversation.update({ where: { id: conversation.id }, data: { metadata: JSON.stringify(newMeta) } })
          }
        } catch { /* non-critical: la pausa se re-evalúa en el siguiente mensaje */ }
      } else {
        const src = contactCF.aiDisabled === true ? 'contact' : 'conversation'
        console.log(`[Core] aiDisabled=true (${src}) for contact ${contact?.id ?? 'unknown'}${untilRaw ? ` (pausa hasta ${untilRaw})` : ''}, skipping AI pipeline`)
        return {
          success: true,
          conversationId: conversation.id,
          contactId: contact?.id ?? null,
          aiReplyText: null,
          engineResult: null as any,
          latencyMs: Date.now() - start,
        }
      }
    }
  }

  // Check AI active-hours window (horario de atención configurable).
  // Fuera de la ventana → la IA NO responde (el vendedor atiende manual).
  {
    let wsSettings: Record<string, unknown> = {}
    try { wsSettings = JSON.parse(workspace.settings || '{}') } catch { wsSettings = {} }
    const aiHours = wsSettings.aiHours as { mode?: string; start?: string; end?: string } | undefined
    if (aiHours && aiHours.mode === 'custom' && aiHours.start && aiHours.end) {
      const tz = tzFromSettings(workspace.settings)
      const nowHM = new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      const toMin = (hm: string) => (parseInt(hm.slice(0, 2), 10) || 0) * 60 + (parseInt(hm.slice(3, 5), 10) || 0)
      const cur = toMin(nowHM), s = toMin(aiHours.start), e = toMin(aiHours.end)
      // Ventana normal (08:00-19:00) o que cruza medianoche (19:00-08:00).
      const within = s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e)
      if (!within) {
        console.log(`[Core] Fuera de horario IA (${aiHours.start}-${aiHours.end} ${tz}, ahora ${nowHM}) — no auto-respuesta`)
        return {
          success: true,
          conversationId: conversation.id,
          contactId: contact?.id ?? null,
          aiReplyText: null,
          engineResult: null as any,
          latencyMs: Date.now() - start,
        }
      }
    }
  }

  // Check aiAutoReply feature flag from workspace settings
  {
    let wsSettings: Record<string, unknown> = {}
    try { wsSettings = JSON.parse(workspace.settings || '{}') } catch { wsSettings = {} }
    const flags = wsSettings.featureFlags as Record<string, boolean> | undefined
    if (flags && flags.aiAutoReply === false) {
      console.log(`[Core] aiAutoReply disabled for workspace ${workspace.id}, skipping AI pipeline`)
      return {
        success: true,
        conversationId: conversation.id,
        contactId: contact?.id ?? null,
        aiReplyText: null,
        engineResult: null as any,
        latencyMs: Date.now() - start,
      }
    }
  }

  // ── 6b. Enforce AI message monthly quota ──
  {
    const planDef = PLANS[workspace.plan] ?? PLANS['free']
    const maxAiMessages = planDef.limits.maxAiMessages
    if (maxAiMessages !== -1) {
      // Ventana mensual anclada a la fecha de renovación del plan (se reinicia
      // cada mes en el aniversario del plan del usuario). Ver aiUsageWindowStart.
      const windowStart = await aiUsageWindowStart(workspace.id)
      const aiCount = await db.message.count({
        where: {
          conversation: { workspaceId: workspace.id },
          isAiGenerated: true,
          createdAt: { gte: windowStart },
        },
      })
      if (aiCount >= maxAiMessages) {
        console.warn(`[Core] AI quota exceeded for workspace ${workspace.id}: ${aiCount}/${maxAiMessages}`)
        const limitMsg = `Has alcanzado el límite de ${maxAiMessages} mensajes IA de tu plan ${planDef.name} este mes. Visita valiautoflow.com para actualizar tu plan.`
        // Save the quota-exceeded reply so the contact sees a response
        await db.message.create({
          data: {
            conversationId: conversation.id,
            content: limitMsg,
            type: 'text',
            direction: 'outbound',
            senderType: 'agent',
            isAiGenerated: false,
          },
        })
        return {
          success: false,
          conversationId: conversation.id,
          contactId: contact?.id ?? null,
          aiReplyText: limitMsg,
          engineResult: null as any,
          latencyMs: Date.now() - start,
        }
      }
    }
  }

  // ── 7. Middleware: pre-process ──
  // ── 6c. Resolve AI API key — tenant key preferred, system key as fallback ──
  // Workspaces can configure their own key in Developer → API Keys.
  // If none is set, the system key (ZAI_API_KEY / GLM_API_KEY env var) is used
  // so self-hosted and new workspaces work out of the box.
  let tenantApiKey: string | undefined
  {
    let wsApiKeySettings: Record<string, string> = {}
    try {
      const raw = typeof workspace.settings === 'string'
        ? JSON.parse(workspace.settings || '{}')
        : (workspace.settings || {})
      wsApiKeySettings = (raw.apiKeys as Record<string, string>) || {}
    } catch { /* ignore */ }

    const preferredProviders = ['glm', 'groq', 'openai', 'deepseek', 'gemini']
    for (const p of preferredProviders) {
      const k = wsApiKeySettings[p]
      if (k && k.length > 10) {
        tenantApiKey = k
        break
      }
    }

    // Fall back to system-level env key so the pipeline is never silently skipped.
    // MiniMax es el único proveedor (GLM/Z.AI retirados 2026-07-22) → su key va
    // primero; callMiniMax solo usa una tenantApiKey si empieza con "sk-".
    const systemFallback = process.env.MINIMAX_API_KEY || process.env.ZAI_API_KEY || process.env.GLM_API_KEY
    if (!tenantApiKey && systemFallback && systemFallback.length > 10) {
      tenantApiKey = systemFallback
      console.log(`[Core] Using system API key for workspace ${workspace.id} (no tenant key configured)`)
    }

    if (!tenantApiKey) {
      console.log(`[Core] No AI API key configured for workspace ${workspace.id} — skipping AI pipeline`)
      return {
        success: true,
        conversationId: conversation.id,
        contactId: contact?.id ?? null,
        aiReplyText: null,
        engineResult: null as any,
        latencyMs: Date.now() - start,
      }
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

  // ── 7. Load conversation history ──
  // Antes eran solo 5 mensajes → el bot "se reiniciaba" y perdía el hilo en
  // conversaciones largas (reportado por Jhon 2026-07-05). Subimos a 30 para
  // que SIEMPRE tenga el contexto de toda la plática antes de responder.
  const historyMessages = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { content: true, senderType: true },
  })
  historyMessages.reverse()

  const messages = historyMessages.map((m) => ({
    role: m.senderType === 'contact' ? 'user' : 'assistant',
    content: m.content,
  }))

  // Middleware: inject context block after system prompt
  const enrichedMessages = injectContext(messages, middlewareResult.contextBlock)

  // ── 7b. DIB: Silent Lead Profiling (non-blocking, Pro+ only) ──
  let leadProfileContext: string | undefined
  let leadProfileForTimeline: LeadProfileData | null = null
  const _planDef = PLANS[workspace.plan] ?? PLANS['free']
  if (contact && _planDef.limits.archetypesEnabled) {
    try {
      // Get messages with timestamps for avg response time calculation
      const messagesWithDates = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { content: true, senderType: true, createdAt: true },
      })
      messagesWithDates.reverse()

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
        leadProfileForTimeline = profile
        leadProfileContext = leadProfiler.buildProfileContext(profile)
        console.log(`[Core:DIB] Profile built: archetype=${profile.archetype} temp=${profile.temperature}`)
      }
    } catch (profileErr) {
      console.warn('[Core:DIB] Lead profiling failed (non-critical):', profileErr instanceof Error ? profileErr.message : profileErr)
    }
  }

  // ── 8. Revenue Engine (AI pipeline) ──
  console.log(`[CORE 3] Historial length: ${enrichedMessages.length} mensajes`)  
  console.log(`[Core:6] 🤖 RevenueEngine (${enrichedMessages.length} messages)...`)

  // Read workspace AI settings — FIX P1: Use personality cache to avoid
  // personality flip during hot-reloads. Cache persists across requests for 5 min.
  let personalityName = 'JHON'
  let aiTemperature = 0.75
  let aiProvider = 'minimax' // IA del bot de WhatsApp: MiniMax por defecto (override por workspace.settings.apiProvider)
  let customSystemPrompt = ''
  let dynamicContext = ''
  // Agente del Factory que atiende este mensaje (para permisos SÍ/NO puede y métricas). Null = JHON.
  let routedAgent: AgentRouteResult | null = null
  let businessAddress = ''
  let businessPhone = ''
  let businessHours = ''
  let appointmentUrl = ''
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
      businessAddress = cached.businessAddress || ''
      businessPhone = cached.businessPhone || ''
      businessHours = cached.businessHours || ''
      appointmentUrl = cached.appointmentUrl || ''
      console.log(`[AI] Using cached personality: ${personalityName} (age: ${Math.round((now - cached.timestamp) / 1000)}s)`)
    } else {
      // Cache miss or expired — read from workspace settings
      const wsSettings = typeof workspace.settings === 'string'
        ? JSON.parse(workspace.settings || '{}')
        : (workspace.settings || {})

      if (wsSettings.defaultPersonality) personalityName = wsSettings.defaultPersonality
      if (wsSettings.aiTemperature !== undefined) aiTemperature = wsSettings.aiTemperature
      if (wsSettings.apiProvider) aiProvider = wsSettings.apiProvider
      if (wsSettings.customSystemPrompt) customSystemPrompt = wsSettings.customSystemPrompt
      // Fall back to AgentPersona table (edited via Developer Panel)
      if (!customSystemPrompt) {
        try {
          const persona = await db.agentPersona.findFirst({
            where: { workspaceId: workspace.id, slug: personalityName, isActive: true },
            select: { systemPrompt: true },
          })
          if (persona?.systemPrompt) customSystemPrompt = persona.systemPrompt
        } catch { /* non-critical */ }
      }
      // Fall back to an INDUSTRY-adaptive persona según workspace.industry
      // (salud, inmobiliaria, retail…). Devuelve '' para automotive, que
      // mantiene la persona pulida JHON del path built-in.
      if (!customSystemPrompt) {
        const industryPersona = buildIndustryPersona(workspace.industry, workspace.name)
        if (industryPersona) customSystemPrompt = industryPersona
      }
      if (wsSettings.dynamicContext) dynamicContext = wsSettings.dynamicContext
      if (wsSettings.businessAddress) businessAddress = String(wsSettings.businessAddress)
      if (wsSettings.businessPhone) businessPhone = String(wsSettings.businessPhone)
      if (wsSettings.businessHours) businessHours = String(wsSettings.businessHours)
      if (wsSettings.appointmentUrl) appointmentUrl = String(wsSettings.appointmentUrl)

      // Update cache
      _personalityCache.set(cacheKey, {
        name: personalityName,
        temperature: aiTemperature,
        provider: aiProvider,
        customPrompt: customSystemPrompt,
        dynamicContext,
        workspaceId: workspace.id,
        timestamp: now,
        businessAddress,
        businessPhone,
        businessHours,
        appointmentUrl,
      })
      console.log(`[AI] Personality loaded and cached: ${personalityName}`)
    }
  } catch (e) {
    console.warn('[AI] Could not parse workspace settings:', e)
  }

  // ── Clasificación de INTENCIÓN temprana (2026-07-20) ──
  // Se clasifica ANTES del router del factory para rutear por intención
  // ("¿cuánto sale al mes?" → financiamiento sin la palabra "crédito").
  // El resultado se REUSA más abajo para la directiva de acción (no se
  // clasifica dos veces).
  let earlyIntent: IntentEnum | null = null
  if (text && !skipAI) {
    try {
      earlyIntent = await new RevenueEngine().classifyIntent(text, tenantApiKey)
      console.log(`[Core:Intent] ${earlyIntent} (pre-routing)`)
    } catch { /* non-critical — el router cae a keywords */ }
  }

  // ── IDIOMA (2026-07-20): si el cliente escribe en INGLÉS, el bot responde
  // en inglés (turistas/extranjeros — antes el saneador lo dejaba mudo).
  if (text && clientWritesEnglish(text)) {
    const langBlock = '🌐 THE CUSTOMER IS WRITING IN ENGLISH: reply COMPLETELY in natural, fluent English (sales tone, same rules). Do NOT mix Spanish. Keep prices in MXN pesos.'
    dynamicContext = dynamicContext ? `${langBlock}\n\n${dynamicContext}` : langBlock
    console.log('[Core:Lang] Cliente en inglés → respuesta en inglés habilitada')
  }

  // ── gBrain Agent Factory router (gated) ──
  // Si el workspace tiene agentes instanciados y uno matchea el mensaje, NO
  // reemplazamos a JHON: inyectamos el conocimiento del especialista como
  // CONTEXTO DE APOYO y JHON sigue siendo el vendedor que califica, cotiza,
  // agenda y CIERRA. (Antes el prompt angosto reemplazaba a JHON, lo que hacía
  // que el bot recitara reglas tipo "NUNCA cierres" y dejara de vender; eso
  // contradecía el objetivo de un único vendedor autónomo que cierra ventas.)
  // Sin instancias activas o sin match → JHON intacto.
  try {
    let wsSettingsForRouter: Record<string, unknown> = {}
    try {
      wsSettingsForRouter = typeof workspace.settings === 'string'
        ? JSON.parse(workspace.settings || '{}')
        : (workspace.settings || {})
    } catch { /* non-critical */ }

    // ¿El contacto YA es cliente? (ganó un trato) → post-venta: lo atiende Soporte.
    let isClient = false
    if (contact?.id) {
      isClient = (await db.deal.count({
        where: { workspaceId: workspace.id, contactId: contact.id, OR: [{ status: 'won' }, { stage: { isWon: true } }] },
      }).catch(() => 0)) > 0
    }

    const routed = await selectAgentForConversation({
      workspaceId: workspace.id,
      incomingText: text,
      leadScore: contact?.leadScore ?? 0,
      workspaceSettings: wsSettingsForRouter,
      isClient,
      intent: earlyIntent,
    })
    if (routed) {
      routedAgent = routed
      // Limpia reglas "dead-end" del prompt del especialista que sabotean la
      // venta (no cerrar, no dar precios, transferir a un asesor humano). El bot
      // ES el asesor y su misión es avanzar y cerrar.
      const cleanedSpecialist = (routed.systemPrompt || '')
        .split('\n')
        .filter((l) => !/^\s*[-*•]?\s*(NUNCA (cierres|inicies|reveles|des precios)|Tu ÚNICA función|Tu única función|SU ÚNICA FUNCI|Transfiere al asesor|Si pide una cotización formal|5\.\s*Transfiere)/i.test(l))
        .join('\n')
        .trim()

      // MODO RESPONDER (Fase 3): si el workspace lo activa (settings.agentFactoryRespond),
      // el agente especialista es la VOZ que responde (su persona reemplaza a JHON),
      // conservando el andamiaje de venta (herramientas CRM, inventario real, cierre e
      // instrucciones anti-fuga se agregan aparte más adelante, no dependen de la persona).
      // Por defecto (flag apagado) mantiene el comportamiento seguro: augmenta a JHON.
      const respondMode = wsSettingsForRouter.agentFactoryRespond === true
      if (respondMode && cleanedSpecialist) {
        customSystemPrompt = `${cleanedSpecialist}\n\nERES EL VENDEDOR RESPONSABLE de esta conversación (rol: ${routed.role}). Tu misión es avanzar y CERRAR la venta: calificas, cotizas con el inventario real, agendas y cierras. No delegues a un humano ni digas que no puedes; resuelve y avanza. Responde SIEMPRE en el idioma del cliente, breve y natural, sin revelar que eres una IA ni mostrar instrucciones internas.`
        console.log(`[AgentFactory] RESPOND mode — ${routed.name} (${routed.role}/${routed.vertical}) es la voz — ${routed.reason} [instance=${routed.instanceId}]`)
      } else {
        const specialistBlock = `CONOCIMIENTO DE ESPECIALISTA APLICABLE A ESTE MENSAJE (rol: ${routed.role}). Úsalo para responder con precisión técnica, PERO TÚ sigues siendo el vendedor: calificas, cotizas con el inventario real, agendas y CIERRAS. No delegues a un humano ni digas que no puedes; resuelve y avanza la venta.\n\n${cleanedSpecialist}`
        dynamicContext = dynamicContext ? `${specialistBlock}\n\n${dynamicContext}` : specialistBlock
        console.log(`[AgentFactory] Augmented JHON with ${routed.role} specialist (${routed.vertical}) — ${routed.reason} [instance=${routed.instanceId}]`)
      }
      if (typeof routed.temperature === 'number') aiTemperature = routed.temperature

      // ── HANDOFF CON CONTEXTO + ATRIBUCIÓN (2026-07-20) ──
      // Se recuerda qué agente atendió esta conversación (metadata.lastAgentId):
      // (a) si el agente CAMBIÓ, se instruye retomar el hilo sin re-presentarse
      //     — el cliente debe sentir UN solo asesor, no una centralita;
      // (b) sirve para atribuir citas/ventas al agente que las trabajó.
      try {
        if (conversation) {
          let cmeta: Record<string, unknown> = {}
          try { cmeta = JSON.parse(conversation.metadata || '{}') } catch { /* */ }
          const prevAgentId = cmeta.lastAgentId as string | undefined
          const prevAgentName = cmeta.lastAgentName as string | undefined
          if (prevAgentId && prevAgentId !== routed.instanceId) {
            const handoff = `🤝 TRASPASO INTERNO (invisible para el cliente): hasta ahora esta conversación la trabajaba el especialista "${prevAgentName || 'anterior'}" y AHORA la tomas tú. RETOMA el hilo exactamente donde iba — NO te presentes de nuevo, NO saludes desde cero, NO pidas datos que el cliente ya dio; conecta tu especialidad con lo último que él dijo, como si fueras el mismo asesor de siempre.`
            dynamicContext = dynamicContext ? `${handoff}\n\n${dynamicContext}` : handoff
            console.log(`[AgentFactory] Handoff: ${prevAgentName || prevAgentId} → ${routed.name}`)
          }
          if (prevAgentId !== routed.instanceId) {
            cmeta.lastAgentId = routed.instanceId
            cmeta.lastAgentName = routed.name
            void db.conversation.update({ where: { id: conversation.id }, data: { metadata: JSON.stringify(cmeta) } }).catch(() => {})
          }
        }
      } catch { /* non-critical */ }

      // Métrica por agente: cuenta los mensajes que este agente del factory atendió. No bloquea.
      void db.agentInstance.update({ where: { id: routed.instanceId }, data: { totalMessagesSent: { increment: 1 } } }).catch(() => {})
      // La asignación queda persistida en metadata y métricas; no se publica
      // un evento legacy sin contrato en el bus canónico.
    }
  } catch (e) {
    console.warn('[AgentFactory] routing skipped (non-critical):', e instanceof Error ? e.message : e)
  }

  // ── Load workspace modules and compose dynamic prompt context ──
  let moduleContextBlock = ''
  let resolvedAgentName: string | undefined
  let activeModuleTools: string[] = []
  try {
    const [wsModules, hooksBlock, trainingBlock, knowledgeBlock] = await Promise.all([
      loadWorkspaceModules(workspace.id),
      loadHooksBlock(workspace.id),
      loadTrainingBlock(workspace.id),
      loadKnowledgeBlock(workspace.id, text), // RAG: docs/manuales relevantes al mensaje
    ])
    const composed = composePrompt(wsModules, customSystemPrompt || '', workspace.name)
    moduleContextBlock = buildModuleContext(composed)
    if (hooksBlock) {
      moduleContextBlock = moduleContextBlock
        ? `${moduleContextBlock}\n\n${hooksBlock}`
        : hooksBlock
    }
    // Lecciones/correcciones que el operador enseñó (entrenamiento in-context).
    if (trainingBlock) {
      moduleContextBlock = moduleContextBlock
        ? `${moduleContextBlock}\n\n${trainingBlock}`
        : trainingBlock
    }
    // Base de conocimiento (RAG): documentos reales de la empresa relevantes al mensaje.
    if (knowledgeBlock) {
      moduleContextBlock = moduleContextBlock
        ? `${moduleContextBlock}\n\n${knowledgeBlock}`
        : knowledgeBlock
    }
    resolvedAgentName = composed.agentName !== 'Jhon' ? composed.agentName : undefined
    activeModuleTools = composed.activeTools

    // Inject the REAL catalog so el bot cotiza inventario real en vez de
    // alucinar modelos/precios. Clave para automotriz (cotizar autos reales).
    const catalogMod = wsModules.find((m) => m.type === 'catalog' && m.enabled)
    if (catalogMod) {
      try {
        const rawItems = await db.catalogItem.findMany({
          where: { workspaceId: workspace.id, isActive: true },
          orderBy: { name: 'asc' },
          take: 80,
          select: { name: true, price: true, currency: true, category: true, stock: true, metadata: true },
        })
        // Respeta la VISIBILIDAD AL CLIENTE de cada estatus: un auto en un
        // estatus con visibleToClient=false (apartado/vendido o uno personalizado
        // oculto) NO se le ofrece al cliente, aunque siga isActive.
        const { clientHiddenStatusKeys, statusKeyOf } = await import('@/lib/inventory-visibility')
        const hiddenKeys = clientHiddenStatusKeys(workspace.settings)
        const items = rawItems.filter((it) => !hiddenKeys.has(statusKeyOf(it.metadata))).slice(0, 40)
        if (items.length > 0) {
          const showPrices = (catalogMod.config as { showPrices?: boolean })?.showPrices !== false
          const lines = items.map((it) => {
            const price = showPrices && it.price != null
              ? ` — ${it.currency || 'MXN'} $${Number(it.price).toLocaleString('es-MX')}`
              : ''
            const cat = it.category ? ` [${it.category}]` : ''
            const stock = it.stock != null ? ` (${it.stock} disp.)` : ''
            return `• ${it.name}${cat}${price}${stock}`
          })
          const catalogReal = `INVENTARIO REAL DISPONIBLE (usa SOLO estos productos, precios y disponibilidad; NUNCA inventes modelos ni precios. Si piden algo que no está, dilo y ofrece lo más cercano):\n${lines.join('\n')}`
          moduleContextBlock = moduleContextBlock ? `${moduleContextBlock}\n\n${catalogReal}` : catalogReal
          console.log(`[Core:Catalog] Injected ${items.length} real catalog item(s) into prompt`)
        }
      } catch { /* non-critical */ }
    }

    // ── COTIZADOR FINANCIERO DETERMINISTA (2026-07-20): si el mensaje habla de
    // financiamiento/mensualidades, se calculan las cifras REALES por código y
    // se inyectan como "números oficiales" — el modelo tiene PROHIBIDO hacer
    // aritmética propia (los LLM se equivocan y un número malo quema la venta).
    try {
      const { mentionsFinancing, parseDownPayment, buildFinancingBlock } = await import('@/lib/crm/financing')
      if (text && mentionsFinancing(text)) {
        // Auto de interés: nombrado en el mensaje > preferido del perfil
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const nText = norm(text)
        const candidates = await db.catalogItem.findMany({
          where: { workspaceId: workspace.id, isActive: true, price: { gt: 0 } },
          select: { name: true, price: true },
          take: 60,
        })
        let car = candidates.find((c) => {
          const toks = norm(c.name).split(/\s+/).filter((t) => t.length >= 3)
          return toks.length > 0 && toks.filter((t) => nText.includes(t)).length >= Math.min(2, toks.length)
        }) || null
        if (!car && contact) {
          const prof = await db.leadProfile.findFirst({ where: { contactId: contact.id }, select: { preferredProduct: true } }).catch(() => null)
          if (prof?.preferredProduct) {
            const nPref = norm(prof.preferredProduct)
            car = candidates.find((c) => nPref.includes(norm(c.name)) || norm(c.name).split(/\s+/).some((t) => t.length >= 4 && nPref.includes(t))) || null
          }
        }
        if (car && car.price) {
          const cfg = getFinancingConfig(workspace.settings)
          const block = buildFinancingBlock(car.name, Number(car.price), cfg, parseDownPayment(text))
          if (block) {
            moduleContextBlock = moduleContextBlock ? `${moduleContextBlock}${block}` : block
            console.log(`[Core:Financing] Cotización determinista inyectada para "${car.name}"`)
          }
        }
      }
    } catch (err) {
      console.warn('[Core:Financing] non-critical:', (err as Error).message)
    }

    // Inject CRM tools instruction so the AI appends [CRM:...] tags.
    // contactHasEmail: el bot solo promete "confirmación por correo" si el
    // contacto de verdad tiene correo; si no, lo pide (y el extractor lo guarda).
    const crmBlock = buildCRMToolsInstruction({ contactHasEmail: !!(contact?.email && String(contact.email).includes('@')) })
    moduleContextBlock = moduleContextBlock
      ? `${moduleContextBlock}\n\n${crmBlock}`
      : crmBlock

    // If physical_location module is active and has address/hours, override legacy settings
    const locationMod = wsModules.find((m) => m.type === 'physical_location' && m.enabled)
    if (locationMod) {
      const locationCfg = locationMod.config as PhysicalLocationConfig
      if (locationCfg.address) businessAddress = locationCfg.address
      if (locationCfg.hours) businessHours = locationCfg.hours
    }

    // If agent_profile module is active, use its agent name for [NOMBRE] placeholder
    const profileMod = wsModules.find((m) => m.type === 'agent_profile' && m.enabled)
    if (profileMod) {
      const profileCfg = profileMod.config as AgentProfileConfig
      if (profileCfg.name) resolvedAgentName = profileCfg.name
    }
  } catch (e) {
    console.warn('[AI] Could not load workspace modules:', e)
  }

  // ── Educate loop guard: force pivot after 2+ educate actions per day ──
  let educateOverride = ''
  try {
    const educateCount = await db.agentLog.count({
      where: {
        conversationId: conversation.id,
        action: 'educate',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    })
    if (educateCount >= 2) {
      educateOverride = `\n\n⚠️ ALERTA DE SISTEMA: Ya has intentado educar a este lead ${educateCount} veces hoy sin progreso. CAMBIA de estrategia AHORA. NO eduques más sobre el producto. Haz UNA pregunta directa para calificar (presupuesto, urgencia o cronograma) o propón agendar una llamada diagnóstico. Si el lead ya calificó, avanza la etapa con [CRM:stage:Cualificado].`
      console.log(`[Core:EducateGuard] Conv ${conversation.id} has ${educateCount} educate actions — injecting pivot override`)
    }
  } catch { /* non-critical */ }

  // ── Hot lead closing block: inject direct closing instructions for score >= 60 ──
  let hotLeadClosingBlock = ''
  if (contact && contact.leadScore >= 60) {
    hotLeadClosingBlock = `\n\n🔥 LEAD CALIENTE (score: ${contact.leadScore}/100) — CIERRE DISPONIBLE (con criterio):` +
      `\nREGLA DE ORO: primero RESPONDE exactamente lo que el cliente acaba de decir o preguntar. Solo activa el cierre cuando el cliente pregunte por precio/planes/cuánto cuesta o diga que quiere avanzar. NO ofrezcas cita, factura ni link de pago si el cliente NO lo pidió o si está respondiendo a una pregunta tuya.` +
      `\nCuando SÍ toque cerrar:` +
      `\n1. Presenta el plan que mejor calza con su caso y da el precio concreto.` +
      `\n2. Conecta el precio con el valor recuperado: "Si recuperas solo 2 clientes más al mes, ya pagaste el año."` +
      `\n3. Solicita los datos para emitir la factura: "Necesito tu RFC y razón social para generarte la factura."` +
      `\n4. Ofrece una llamada/demo como cierre, pero NO propongas una fecha y hora concreta hasta que el cliente ACEPTE reunirse o lo pida. Si apenas está respondiendo tus preguntas, sigue la conversación consultiva.` +
      `\nAvanza la etapa con [CRM:stage:Negociación]; al confirmar compra o pedir factura, [CRM:stage:Cerrado]. El lead ya calificó: NO repitas preguntas de diagnóstico ("¿cuántos leads manejas?").`
  }

  // ── Guardia de CONTINUIDAD: evita que el bot "se reinicie" o pierda el hilo.
  // Se inyecta SIEMPRE que ya hay conversación previa (reportado por Jhon: el
  // bot se volvía a presentar y cambiaba de tema al recibir respuestas cortas).
  let continuityGuard = ''
  if (historyMessages.length > 1) {
    continuityGuard = `\n\n🧠 CONTINUIDAD (OBLIGATORIO — léelo antes de responder):` +
      `\n- Esta conversación YA ESTÁ EN CURSO. Lee TODO el historial de arriba antes de escribir.` +
      `\n- NUNCA te vuelvas a presentar ni saludes de nuevo ("Hola, soy Jhon…", "gracias por escribirnos"). Eso ya ocurrió al inicio.` +
      `\n- NUNCA reinicies el tema ni hagas una pregunta que el cliente ya respondió. Recuerda lo que ya te contó (su giro, volumen, necesidades) y aprovéchalo.` +
      `\n- Si el cliente RESPONDE a una pregunta que le hiciste (por ejemplo eligió una de las opciones que le diste), continúa por ESE camino: profundiza en lo que eligió y conéctalo con cómo lo resuelves. NO cambies de tema.` +
      `\n- NO propongas una fecha/hora de cita ni digas "tengo disponible el lunes a las…" a menos que el cliente pida agendar, pida una reunión/llamada, o acepte tu invitación a reunirse. Si apenas está platicando o respondiendo, sigue la charla consultiva.` +
      `\n- Responde con naturalidad humana, como un vendedor real que recuerda toda la plática y escucha lo que el cliente realmente dijo.`
  }

  // ── Traspaso a CIERRE por conversación larga (evita el "qualifier atascado") ──
  // Reportado por el cliente: el calificador se queda en conversaciones de 100+
  // mensajes sin cerrar (fuga de tokens). Si la charla ya es larga o el lead está
  // caliente, se le ordena DEJAR de calificar y avanzar/cerrar o escalar a humano.
  let handoverBlock = ''
  if (conversation && contact) {
    const convMsgCount = await db.message.count({ where: { conversationId: conversation.id } }).catch(() => 0)
    if (convMsgCount >= 20 || contact.leadScore >= 70) {
      handoverBlock = `\n\n⏳ CONVERSACIÓN AVANZADA (${convMsgCount} mensajes${contact.leadScore >= 70 ? `, score ${contact.leadScore}` : ''}) — DEJA DE CALIFICAR:` +
        `\n- Ya tienes contexto suficiente. NO hagas más preguntas de diagnóstico; AVANZA: propón el siguiente paso concreto (precio, propuesta, demo, cita o cierre).` +
        `\n- Si el cliente mostró interés, pide el compromiso ("¿lo dejamos agendado?" / "¿te preparo la propuesta?").` +
        `\n- Si tras varios intentos el cliente sigue sin avanzar o pide algo fuera de tu alcance, ofrece pasar a un asesor humano con naturalidad ("déjame que un asesor te contacte para afinar los detalles").`
    }
  }

  // ── Appointment state injection: read pending proposal / confirmed appointment from DB ──
  let apptContextBlock = ''
  const wsTz = tzFromSettings(workspace.settings)
  try {
    // 1. Check for confirmed pending appointment in DB
    if (contact?.id) {
      const pendingAppt = await db.appointment.findFirst({
        where: { contactId: contact.id, status: 'pending', date: { gte: new Date() } },
        orderBy: { date: 'asc' },
      })
      if (pendingAppt) {
        const apptDateStr = pendingAppt.date.toLocaleDateString('es-MX', {
          timeZone: wsTz, weekday: 'long', day: 'numeric', month: 'long',
        })
        const apptTimeStr = pendingAppt.date.toLocaleTimeString('es-MX', {
          timeZone: wsTz, hour: '2-digit', minute: '2-digit', hour12: true,
        })
        apptContextBlock = `\n\n⚠️ CITA YA CONFIRMADA EN SISTEMA: "${pendingAppt.title}" el ${apptDateStr} a las ${apptTimeStr}. NO vuelvas a proponer horarios nuevos. Si el lead escribe, pregunta si necesita reagendar o en qué más puedes ayudar.`
        console.log(`[Core:ApptState] Confirmed pending appt for contact ${contact.id}: ${apptDateStr} ${apptTimeStr}`)
      }
    }
    // 2. If no confirmed appointment, check conversation metadata for unconfirmed proposal
    if (!apptContextBlock) {
      let convMetaForAppt: Record<string, unknown> = {}
      try { convMetaForAppt = JSON.parse(conversation.metadata || '{}') } catch {}
      const proposal = convMetaForAppt.apptProposal as { proposedDate?: string; time1?: string; time2?: string } | undefined
      if (proposal?.proposedDate) {
        const pDate = new Date(proposal.proposedDate + 'T12:00:00')
        const pDateStr = isNaN(pDate.getTime()) ? proposal.proposedDate : pDate.toLocaleDateString('es-MX', {
          timeZone: wsTz, weekday: 'long', day: 'numeric', month: 'long',
        })
        const t1 = proposal.time1 || ''
        const t2 = proposal.time2 ? ` o ${proposal.time2}` : ''
        apptContextBlock = `\n\n⚠️ PROPUESTA DE CITA ACTIVA (no confirmada aún): Ya ofreciste el ${pDateStr} a las ${t1}${t2}.\nREGLAS CRÍTICAS PARA ESTA RESPUESTA:\n- Si el lead dice "sí", "si", "ok", "por favor", "confirmado", "dale", "listo", "claro" o cualquier afirmación → responde "Confirmado ✅ Te espero el ${pDateStr} a las ${t1}." y emite OBLIGATORIAMENTE [CRM:appointment:${proposal.proposedDate}T${proposal.time1 || '11:00'}:00|Llamada diagnóstico|call].\n- Si el lead menciona OTRO día: ACEPTA y ofrece 2 horarios para ese nuevo día. Emite [CRM:appt_propose:YYYY-MM-DD|HH:mm|HH:mm].\n- Si el lead dice "temprano": ofrece 9:00am y 10:00am para el mismo día.\n- NUNCA propongas el ${pDateStr} de nuevo si el lead ya lo rechazó.`
        console.log(`[Core:ApptState] Pending proposal in metadata: ${pDateStr} ${t1}${t2}`)
      }
    }
    // 3. Anti-doble-reserva: inyecta los horarios ya ocupados del workspace
    // (próximos 7 días) para que el bot NO ofrezca un slot tomado por otro lead.
    // Sin esto el bot agenda a ciegas y dos clientes caen en la misma hora.
    try {
      const horizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      const upcoming = await db.appointment.findMany({
        where: {
          workspaceId: workspace.id,
          status: { not: 'cancelled' },
          date: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000), lte: horizon },
        },
        orderBy: { date: 'asc' },
        select: { date: true, type: true, title: true },
        take: 60,
      })
      // Días BLOQUEADOS por el negocio (viaje, festivo...) — el bot NO agenda
      // NADA esos días (botón "Bloquear día" del calendario).
      const blocked = upcoming.filter((a) => a.type === 'blocked')
      if (blocked.length > 0) {
        const days = [...new Set(blocked.map((a) =>
          a.date.toLocaleDateString('es-MX', { timeZone: wsTz, weekday: 'long', day: 'numeric', month: 'long' })
        ))]
        apptContextBlock += `\n\n🚫 DÍAS NO DISPONIBLES (el negocio NO atiende — JAMÁS propongas ni confirmes citas en estos días; ofrece el siguiente día hábil): ${days.join(' · ')}.`
        console.log(`[Core:ApptState] ${days.length} blocked day(s) injected`)
      }
      const normal = upcoming.filter((a) => a.type !== 'blocked')
      if (normal.length > 0) {
        const slots = normal.map((a) =>
          a.date.toLocaleString('es-MX', {
            timeZone: wsTz, weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', hour12: true,
          })
        )
        apptContextBlock += `\n\n📅 HORARIOS YA OCUPADOS (NO ofrezcas ninguno de estos; elige otra hora libre dentro del horario de atención): ${slots.join(' · ')}.`
        console.log(`[Core:ApptState] ${normal.length} occupied slot(s) injected for anti-double-booking`)
      }
    } catch { /* non-critical */ }
  } catch { /* non-critical */ }

  // ── Contexto del anuncio de origen (CTWA): persiste una vez en el contacto
  // y se inyecta SIEMPRE al prompt (también en seguimientos) para que el bot
  // abra y converse sabiendo de qué campaña llegó el cliente.
  let adOriginBlock = ''
  try {
    if (contact) {
      const cf = JSON.parse(contact.customFields || '{}')
      if (adContext && (adContext.title || adContext.body) && !cf.adSource) {
        cf.adSource = [adContext.title, adContext.body].filter(Boolean).join(' — ').slice(0, 300)
        if (adContext.sourceUrl) cf.adSourceUrl = adContext.sourceUrl.slice(0, 300)
        cf.adSourceAt = new Date().toISOString()
        await db.contact.update({ where: { id: contact.id }, data: { customFields: JSON.stringify(cf) } }).catch(() => {})
        console.log(`[Core:AdOrigin] Contacto llegó de anuncio: "${cf.adSource}"`)
      }
      const stored = cf.adSource || (adContext ? [adContext.title, adContext.body].filter(Boolean).join(' — ') : '')
      if (stored) {
        adOriginBlock = `\n\n📣 ORIGEN DEL CLIENTE: llegó desde un ANUNCIO de Facebook/Instagram ("${stored}"). Úsalo con naturalidad para dar contexto ("vi que llegaste desde nuestro anuncio de…") — demuestra que lo conoces; NO le preguntes cómo nos encontró.`
      }
    }
  } catch { /* non-critical */ }

  const engine = new RevenueEngine()

  // ── Paso 1: intención en UNA de las 7 categorías del spec (compra/credito/
  // cita/info/queja/reclamo/saludo) → directiva de acción al prompt.
  // REUSA la clasificación temprana del router (earlyIntent) — no clasifica 2 veces.
  if (text) {
    try {
      const classifiedIntent = earlyIntent || await engine.classifyIntent(text, tenantApiKey)
      const directive = buildIntentActionDirective(classifiedIntent)
      dynamicContext = dynamicContext ? `${directive}\n\n${dynamicContext}` : directive
      console.log(`[Core:Intent] ${classifiedIntent}`)
      if ((classifiedIntent === 'queja' || classifiedIntent === 'reclamo') && contact) {
        const cName = `${contact.firstName} ${contact.lastName || ''}`.trim()
        const tag = classifiedIntent === 'reclamo' ? '🟠 RECLAMO' : '🟠 QUEJA'
        void broadcastToWorkspace(
          workspace.id,
          `${tag} <b>requiere atención humana</b>\n👤 ${cName}\n📱 ${phone}\n💬 "${text.slice(0, 200)}"`
        ).catch(() => {})
      }
    } catch (e) {
      console.warn('[Core:Intent] classify error (non-critical):', (e as Error).message)
    }
  }

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
    workspaceContext: {
      businessName: workspace.name,
      industry: workspace.industry,
      businessAddress: businessAddress || undefined,
      businessPhone: businessPhone || undefined,
      businessHours: businessHours || undefined,
      appointmentUrl: appointmentUrl || undefined,
      moduleContext: moduleContextBlock || undefined,
      agentName: resolvedAgentName,
      activeModuleTools: activeModuleTools.length > 0 ? activeModuleTools : undefined,
      timezone: tzFromSettings(workspace.settings),
    },
    personalityName,
    customSystemPrompt,
    aiProvider,
    temperature: aiTemperature,
    dynamicContext: dynamicContext + educateOverride + apptContextBlock + adOriginBlock + hotLeadClosingBlock + continuityGuard + handoverBlock,
    conversationHistory: enrichedMessages.slice(0, -1),
    conversationId: conversation.id,
    leadProfileContext, // DIB: pass profile context for personalization
    tenantApiKey, // Use tenant's own API key
  })

  // ── 9. Extract + post-process AI response ──
  console.log(`[Core:7] 📤 Extracting response...`)
  let aiReplyText: string | null = null
  let bookedAppointmentInfo: { title: string; date: string; durationMin: number } | null = null
  let mediaToSend: { images: string[]; video?: string | null; caption?: string } | null = null
  // CRM actions parsed from the raw AI response (before any stripping)
  let parsedCRMActions: ReturnType<typeof parseCRMActions> = []

  if (engineResult.response) {
    const rawResponse =
      engineResult.response.rawResponse ||
      engineResult.response.direction ||
      [engineResult.response.insight, engineResult.response.question].filter(Boolean).join(' ') ||
      null

    if (rawResponse) {
      // Parse CRM action tags from raw AI output before any processing
      parsedCRMActions = parseCRMActions(rawResponse)
      // Strip CRM tags before chain-of-thought extraction
      const withoutCRM = parsedCRMActions.length > 0 ? stripCRMActions(rawResponse) : rawResponse
      if (parsedCRMActions.length > 0) {
        console.log(`[Core:CRM] Parsed ${parsedCRMActions.length} CRM actions:`, parsedCRMActions)
      }
      // FIX P0: Strip chain-of-thought analysis from AI response before showing to user
      const cleanedResponse = extractFinalResponse(withoutCRM)
      if (cleanedResponse !== withoutCRM) {
        console.log(`[Core] extractFinalResponse: ${withoutCRM.length} → ${cleanedResponse.length} chars`)
      }
      const postResult = postProcess(cleanedResponse, middlewareResult.state)
      aiReplyText = postResult.filteredResponse
      if (postResult.wasModified) {
        console.log(`[Core] Response post-processed (${cleanedResponse.length} → ${aiReplyText.length} chars)`)
      }
      // Guard de placeholders: "[nombre]"/"{{nombre}}" literales JAMÁS al cliente
      // (visto en producción 2026-07-13: "Entiendo perfectamente, [nombre]").
      const phRe = /\[(nombre|name|cliente|empresa)\]|\{\{\s*(nombre|name|cliente|empresa)\s*\}\}/gi
      if (aiReplyText && phRe.test(aiReplyText)) {
        const fn = (contact?.firstName || '').trim().split(' ')[0]
        aiReplyText = aiReplyText
          .replace(phRe, fn || '')
          .replace(/\s{2,}/g, ' ')
          .replace(/\s+([,.!?;:])/g, '$1')
          .replace(/,\s*([,.!?])/g, '$1')
          .trim()
        console.log(`[Core] Placeholder literal saneado en la respuesta (→ "${fn || 'sin nombre'}")`)
      }
    }
  }

  // ── 9a-bis. Payment link / CFDI invoice from CRM actions (Revenue Engine) ──
  // SELLER/CERRADOR emit [CRM:pago:monto|concepto] / [CRM:factura:rfc|razon|uso]
  // when closing. We resolve them against the TENANT's own Stripe/CFDI config
  // (lib/erp/payments). If the tenant has not wired its credentials, nothing is
  // charged/invoiced and the customer-facing reply is left intact (no fake link).
  if (aiReplyText && contact) {
    // Verificación/Control: ¿el workspace exige aprobación humana para acciones
    // críticas (pago/factura)? Si sí, NO se ejecutan en automático: se crea una
    // aprobación pendiente y se notifica al operador; se ejecutan al aprobar.
    let requireApproval = false
    try {
      const _s = typeof workspace.settings === 'string' ? JSON.parse(workspace.settings || '{}') : (workspace.settings || {})
      requireApproval = _s.requireApproval === true
    } catch { /* */ }

    const pagoAction = parsedCRMActions.find(a => a.type === 'pago')
    if (pagoAction && !canRunTool(personalityName, 'generatePaymentLink', routedAgent?.forbiddenActions)) {
      console.warn(`[Core:9a-bis] ${routedAgent?.name || personalityName} not permitted to use generatePaymentLink — skipping (permisos por agente)`)
    } else if (pagoAction && requireApproval) {
      // Retener para aprobación humana
      try {
        const [montoStr, ...conceptParts] = pagoAction.value.split('|')
        const amountMXN = parseInt(String(montoStr).replace(/[^\d]/g, ''), 10) || 0
        const concept = (conceptParts.join('|').trim()) || 'Pago'
        const cName = `${contact.firstName} ${contact.lastName || ''}`.trim()
        await db.pendingApproval.create({
          data: {
            workspaceId: workspace.id, contactId: contact.id, conversationId: conversation?.id ?? null,
            type: 'payment', summary: `Link de pago $${amountMXN.toLocaleString('es-MX')} MXN — ${cName} (${concept})`,
            payload: JSON.stringify({ amountMXN, concept, phone, email: contact.email || null }),
          },
        })
        await broadcastToWorkspace(workspace.id, `🔐 <b>Aprobación requerida — Pago</b>\n👤 ${cName}\n💰 $${amountMXN.toLocaleString('es-MX')} MXN\n📝 ${concept}\n\nApruébalo en el panel (Aprobaciones) para enviarle el link al cliente.`).catch(() => {})
        console.log(`[Core:9a-bis] Payment HELD for approval (${contact.id}, $${amountMXN})`)
      } catch (err) { console.warn('[Core:9a-bis] approval(payment) error:', (err as Error).message) }
    } else if (pagoAction) {
      try {
        const [montoStr, ...conceptParts] = pagoAction.value.split('|')
        const amountMXN = parseInt(String(montoStr).replace(/[^\d]/g, ''), 10) || 0
        const concept = (conceptParts.join('|').trim()) || 'Pago'
        const link = await createTenantPaymentLink({
          settings: workspace.settings,
          amountMXN,
          concept,
          customerEmail: contact.email || undefined,
          metadata: { workspaceId: workspace.id, contactId: contact.id },
        })
        if (link.configured) {
          // Wrap in a tracked redirect so opening it bumps the score +10 (spec Paso 3).
          const trackedUrl = buildTrackedQuoteLink(contact.id, link.url)
          aiReplyText = `${aiReplyText}\n\n💳 Aquí tienes tu link de pago seguro:\n${trackedUrl}`
          console.log(`[Core:9a-bis] Payment link generated for ${contact.id} ($${amountMXN})`)
        } else {
          console.warn(`[Core:9a-bis] Payment link NOT generated (${link.reason}) — tenant must configure its own Stripe`)
          // Notify operator so a human can send the real link.
          await broadcastToWorkspace(
            workspace.id,
            `💳 <b>Link de pago solicitado</b>\n👤 ${contact.firstName} ${contact.lastName || ''}\n💰 $${amountMXN} MXN\n⚠️ Stripe del concesionario no configurado — envíalo manualmente.`
          ).catch(() => {})
        }
      } catch (err) {
        console.warn('[Core:9a-bis] Payment link error (non-critical):', (err as Error).message)
      }
    }

    const facturaAction = parsedCRMActions.find(a => a.type === 'factura')
    if (facturaAction && !canRunTool(personalityName, 'createInvoice', routedAgent?.forbiddenActions)) {
      console.warn(`[Core:9a-bis] ${routedAgent?.name || personalityName} not permitted to use createInvoice — skipping (permisos por agente)`)
    } else if (facturaAction && requireApproval) {
      try {
        const [rfc, razon, uso] = facturaAction.value.split('|').map(s => s.trim())
        const montoFromPago = pagoAction ? parseInt(String(pagoAction.value.split('|')[0]).replace(/[^\d]/g, ''), 10) || 0 : 0
        const cName = `${contact.firstName} ${contact.lastName || ''}`.trim()
        await db.pendingApproval.create({
          data: {
            workspaceId: workspace.id, contactId: contact.id, conversationId: conversation?.id ?? null,
            type: 'invoice', summary: `Factura CFDI — ${cName} (RFC ${rfc || 'n/d'}, $${montoFromPago.toLocaleString('es-MX')})`,
            payload: JSON.stringify({ rfc: rfc || '', razon: razon || cName, uso: uso || null, amountMXN: montoFromPago, phone }),
          },
        })
        await broadcastToWorkspace(workspace.id, `🔐 <b>Aprobación requerida — Factura CFDI</b>\n👤 ${cName}\n🆔 RFC: ${rfc || 'n/d'}\n💰 $${montoFromPago.toLocaleString('es-MX')} MXN\n\nApruébala en el panel (Aprobaciones).`).catch(() => {})
        console.log(`[Core:9a-bis] Invoice HELD for approval (${contact.id})`)
      } catch (err) { console.warn('[Core:9a-bis] approval(invoice) error:', (err as Error).message) }
    } else if (facturaAction) {
      try {
        const [rfc, razon, uso] = facturaAction.value.split('|').map(s => s.trim())
        const montoFromPago = pagoAction
          ? parseInt(String(pagoAction.value.split('|')[0]).replace(/[^\d]/g, ''), 10) || 0
          : 0
        const invoice = await createTenantInvoice({
          settings: workspace.settings,
          rfc: rfc || '',
          razonSocial: razon || (contact.firstName + ' ' + (contact.lastName || '')).trim(),
          usoCFDI: uso || undefined,
          amountMXN: montoFromPago,
          concept: 'Venta',
        })
        if (invoice.configured) {
          console.log(`[Core:9a-bis] CFDI generated for ${contact.id} (id ${invoice.id})`)
        } else {
          console.warn(`[Core:9a-bis] CFDI NOT generated (${invoice.reason}) — tenant must configure its CFDI provider`)
          await broadcastToWorkspace(
            workspace.id,
            `🧾 <b>Factura CFDI solicitada</b>\n👤 ${contact.firstName} ${contact.lastName || ''}\n🆔 RFC: ${rfc || 'n/d'}\n⚠️ Proveedor CFDI no configurado — factura manual pendiente.`
          ).catch(() => {})
        }
      } catch (err) {
        console.warn('[Core:9a-bis] CFDI error (non-critical):', (err as Error).message)
      }
    }

    // ── 9a-ter. Cotización de financiamiento EXACTA (el servidor calcula) ──
    const cotizaAction = parsedCRMActions.find(a => a.type === 'cotiza')
    if (cotizaAction) {
      try {
        const [precioStr, engancheStr, plazoStr] = cotizaAction.value.split('|').map(s => s.trim())
        const precio = parseInt(String(precioStr).replace(/[^\d]/g, ''), 10) || 0
        if (precio > 0) {
          const cfg = getFinancingConfig(workspace.settings)
          const plazoNum = plazoStr ? parseInt(plazoStr.replace(/[^\d]/g, ''), 10) : undefined
          const quote = computeAutoQuote({ price: precio, downPayment: engancheStr || undefined, termMonths: plazoNum && plazoNum > 0 ? plazoNum : undefined, config: cfg })
          aiReplyText = `${aiReplyText}\n\n${formatQuoteMessage(quote)}`
          console.log(`[Core:cotiza] Cotización generada (precio ${precio}, ${quote.options.length} opción/es)`)
        }
      } catch (err) {
        console.warn('[Core:cotiza] error (non-critical):', (err as Error).message)
      }
    }

    // ── 9a-quater. Foto del auto desde el inventario ──
    const fotoAction = parsedCRMActions.find(a => a.type === 'foto')
    if (fotoAction && fotoAction.value.trim()) {
      try {
        const q = fotoAction.value.trim()
        const item = await db.catalogItem.findFirst({
          where: { workspaceId: workspace.id, isActive: true, name: { contains: q } },
          orderBy: { name: 'asc' },
          select: { name: true, imageUrl: true, price: true, metadata: true },
        })
        if (item) {
          // Junta TODAS las fotos del auto (metadata.images) + la principal, y el
          // video si existe → el bot manda un mini-catálogo para enganchar al lead.
          let m: Record<string, unknown> = {}
          try { m = JSON.parse(item.metadata || '{}') } catch { /* */ }
          const imgs: string[] = []
          if (Array.isArray(m.images)) for (const im of m.images as string[]) { if (im && !imgs.includes(im)) imgs.push(im) }
          if (item.imageUrl && !imgs.includes(item.imageUrl)) imgs.unshift(item.imageUrl)
          const video = (m.video as string) || (m.videoUrl as string) || null
          if (imgs.length > 0 || video) {
            const priceStr = item.price != null ? ` — $${Number(item.price).toLocaleString('es-MX')}` : ''
            mediaToSend = { images: imgs.slice(0, 5), video, caption: `${item.name}${priceStr}` }
            console.log(`[Core:foto] Media a enviar: ${item.name} (${imgs.length} foto(s)${video ? ' + video' : ''})`)
          }
        }
      } catch (err) {
        console.warn('[Core:foto] error (non-critical):', (err as Error).message)
      }
    }

    // ── FICHA PROACTIVA (2026-07-20): si el CLIENTE nombró un auto del
    // inventario y aún no le mandamos sus fotos en esta conversación, la ficha
    // (foto + precio) sale como REFLEJO — sin esperar a que el modelo la pida.
    // Marca por conversación en metadata.sentMediaNames para no repetir.
    if (!mediaToSend && text && conversation && aiReplyText) {
      try {
        const normx = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const nText = normx(text)
        const items = await db.catalogItem.findMany({
          where: { workspaceId: workspace.id, isActive: true },
          select: { name: true, imageUrl: true, price: true, metadata: true },
          take: 60,
        })
        const hit = items.find((c) => {
          const toks = normx(c.name).split(/\s+/).filter((t) => t.length >= 3)
          return toks.length > 0 && toks.filter((t) => nText.includes(t)).length >= Math.min(2, toks.length)
        })
        if (hit) {
          let cmeta: Record<string, unknown> = {}
          try { cmeta = JSON.parse(conversation.metadata || '{}') } catch { /* */ }
          const already = Array.isArray(cmeta.sentMediaNames) ? (cmeta.sentMediaNames as string[]) : []
          if (!already.includes(hit.name)) {
            let m2: Record<string, unknown> = {}
            try { m2 = JSON.parse(hit.metadata || '{}') } catch { /* */ }
            const imgs: string[] = []
            if (hit.imageUrl) imgs.push(hit.imageUrl)
            if (Array.isArray(m2.images)) for (const im of m2.images as string[]) { if (im && !imgs.includes(im)) imgs.push(im) }
            if (imgs.length > 0) {
              const priceStr = hit.price != null ? ` — $${Number(hit.price).toLocaleString('es-MX')}` : ''
              mediaToSend = { images: imgs.slice(0, 2), video: null, caption: `${hit.name}${priceStr}` }
              cmeta.sentMediaNames = [...already, hit.name].slice(-20)
              void db.conversation.update({ where: { id: conversation.id }, data: { metadata: JSON.stringify(cmeta) } }).catch(() => {})
              console.log(`[Core:FichaProactiva] Cliente nombró "${hit.name}" → ficha automática (${Math.min(imgs.length, 2)} foto(s))`)
            }
          }
        }
      } catch (err) {
        console.warn('[Core:FichaProactiva] non-critical:', (err as Error).message)
      }
    }
  }

  // ── 9a-RESCATE (2026-07-20): a veces el modelo responde SOLO con tags
  // [CRM:...] (su texto visible era razonamiento y el saneador lo barrió) →
  // aiReplyText queda vacío y el cliente no recibe NADA. Si entre esos tags
  // venía [CRM:cotiza], el servidor construye la respuesta con el cotizador
  // exacto — el lead que preguntó por mensualidades SIEMPRE recibe sus números.
  if (!aiReplyText && contact) {
    const cotizaRescue = parsedCRMActions.find(a => a.type === 'cotiza')
    if (cotizaRescue) {
      try {
        const [precioStr, engancheStr, plazoStr] = cotizaRescue.value.split('|').map(s => s.trim())
        const precio = parseInt(String(precioStr).replace(/[^\d]/g, ''), 10) || 0
        if (precio > 0) {
          const cfg = getFinancingConfig(workspace.settings)
          const plazoNum = plazoStr ? parseInt(plazoStr.replace(/[^\d]/g, ''), 10) : undefined
          const quote = computeAutoQuote({ price: precio, downPayment: engancheStr || undefined, termMonths: plazoNum && plazoNum > 0 ? plazoNum : undefined, config: cfg })
          aiReplyText = formatQuoteMessage(quote)
          console.log('[Core:cotiza] RESCATE: el modelo solo emitió tags — respuesta construida desde el cotizador del servidor')
        }
      } catch (err) {
        console.warn('[Core:cotiza] rescate falló (non-critical):', (err as Error).message)
      }
    }
  }

  // ── 9b. Sentiment Analysis + Telegram Alerts (Module 8+9) ──
  // Run non-blocking — never delays response delivery
  if (contact && text) {
    Promise.resolve().then(async () => {
      try {
        const _engine = new RevenueEngine()
        const sentiment = await _engine.analyzeSentiment(text, tenantApiKey)
        console.log(`[Core:9b] Sentiment: ${sentiment} for contact ${contact.id}`)

        // Alert CEO if lead is angry/urgent
        if (sentiment === 'ENOJADO' || sentiment === 'URGENTE') {
          const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim()
          const alertMsg = sentiment === 'ENOJADO'
            ? `🔴 <b>ALERTA: Lead ENOJADO</b>\n👤 ${contactName}\n📱 ${phone}\n💬 "${text.slice(0, 200)}"`
            : `🟡 <b>ALERTA: Lead URGENTE</b>\n👤 ${contactName}\n📱 ${phone}\n💬 "${text.slice(0, 200)}"`
          await broadcastToWorkspace(workspace.id, alertMsg).catch(() => {})
          console.log(`[Core:9b] Telegram alert sent (${sentiment}) for ${contact.id}`)
          // La MISMA alerta queda en la bitácora del expediente (antes solo se
          // veía en Telegram y el historial del cliente quedaba vacío).
          await logTimelineEvent({
            workspaceId: workspace.id, contactId: contact.id, conversationId: conversation?.id,
            type: 'milestone',
            title: sentiment === 'ENOJADO' ? '🔴 Alerta: cliente ENOJADO' : '🟡 Alerta: lead URGENTE',
            detail: `Mensaje que disparó la alerta: "${text.slice(0, 200)}" (alerta enviada por Telegram al equipo)`,
            dedupeKey: `alert-${sentiment}-${conversation?.id || contact.id}-${text.slice(0, 60)}`,
            source: 'ai', importance: 'high',
          }).catch(() => {})
        }

        // Alert on hot lead inactive > 2 days
        if (contact.temperature === 'hot' && contact.leadScore >= 60 && contact.lastMessageAt) {
          const msSinceLastMsg = Date.now() - new Date(contact.lastMessageAt).getTime()
          const hoursSinceLastMsg = msSinceLastMsg / (1000 * 60 * 60)
          if (hoursSinceLastMsg > 48) {
            const contactName = `${contact.firstName} ${contact.lastName || ''}`.trim()
            await broadcastToWorkspace(workspace.id,
              `🔥 <b>Lead CALIENTE inactivo ${Math.round(hoursSinceLastMsg)}h</b>\n👤 ${contactName}\n📱 ${phone}\n🎯 Score: ${contact.leadScore}`
            ).catch(() => {})
            await logTimelineEvent({
              workspaceId: workspace.id, contactId: contact.id, conversationId: conversation?.id,
              type: 'milestone',
              title: `🔥 Alerta: lead caliente inactivo ${Math.round(hoursSinceLastMsg)}h (score ${contact.leadScore})`,
              dedupeKey: `hot-inactive-${contact.id}-${new Date().toISOString().slice(0, 10)}`,
              source: 'ai', importance: 'high',
            }).catch(() => {})
          }
        }
      } catch (err) {
        console.warn('[Core:9b] Sentiment/alert error (non-critical):', (err as Error).message)
      }
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
        assignedAgentId: engineResult.agentRouting.agentType,
      },
    })
  }

  // ── 11. Update contact lead score + tags (with AI CRM actions) ──
  if (contact && engineResult.action) {
    const existingTags: string[] = JSON.parse(contact.tags || '[]')
    const newTags = engineResult.crmUpdates
      ?.filter((u) => u.type === 'tags')
      .flatMap((u) => u.value)
      .filter((t) => !existingTags.includes(t as string)) as string[]

    // CRM tags from AI response
    const aiTagActions = parsedCRMActions.filter(a => a.type === 'tag').map(a => a.value)
    const mergedTags = [...new Set([...existingTags, ...newTags, ...aiTagActions])]

    // Lead score — EVENT-BASED (spec Paso 3). Deterministic increments are
    // applied additively over the previous score. This is authoritative; the
    // AI's [CRM:score] tag may only RAISE it (never below the event floor) so
    // an explicit "no me interesa" −30 can't be undone by an optimistic AI.
    const eventDelta = computeLeadScoreDelta(text || '')
    let newLeadScore = Math.min(100, Math.max(0, contact.leadScore + eventDelta))
    const scoreAction = parsedCRMActions.find(a => a.type === 'score')
    if (scoreAction && eventDelta >= 0) {
      const aiScore = parseInt(scoreAction.value)
      if (!isNaN(aiScore)) newLeadScore = Math.min(100, Math.max(newLeadScore, aiScore))
    }

    // AI-driven temperature or derive from score (spec: hot ≥ 70)
    const tempAction = parsedCRMActions.find(a => a.type === 'temp')
    const newTemperature: string = tempAction?.value
      ? tempAction.value
      : (newLeadScore >= 70 ? 'hot' : newLeadScore >= 30 ? 'warm' : 'cold')

    await db.contact.update({
      where: { id: contact.id },
      data: {
        leadScore: newLeadScore,
        temperature: newTemperature,
        lastMessageAt: new Date(),
        tags: JSON.stringify(mergedTags),
      },
    })

    // Event Bus: cambio de score del lead dentro del evento canónico de contacto.
    if (newLeadScore !== contact.leadScore) {
      publish('contact.updated', {
        contactId: contact.id,
        workspaceId: workspace.id,
        changes: {
          leadScore: { from: contact.leadScore, to: newLeadScore },
        },
      })
    }

    // ── Section 15 — Hot-lead threshold crossing notification ──
    // We only fire when the score CROSSES the 80 threshold (was < 80, now
    // ≥ 80). Re-notifying on every inbound message from an already-hot
    // lead would flood the operator. EngineEvent with type
    // 'HOT_LEAD_THRESHOLD_CROSSED' serves as a dedup record so the
    // crossing only fires once until the score drops back below 80.
    const HOT_LEAD_THRESHOLD = 80
    const crossedHotThreshold =
      contact.leadScore < HOT_LEAD_THRESHOLD && newLeadScore >= HOT_LEAD_THRESHOLD
    if (crossedHotThreshold) {
      try {
        const alreadyNotified = await db.engineEvent.findFirst({
          where: {
            workspaceId: workspace.id,
            contactId: contact.id,
            type: 'HOT_LEAD_THRESHOLD_CROSSED',
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        })
        if (!alreadyNotified) {
          const contactName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'Sin nombre'
          await notifyHotLead(workspace.id, {
            contactName,
            score: newLeadScore,
            phone,
            contactId: contact.id,
          })
          await db.engineEvent.create({
            data: {
              workspaceId: workspace.id,
              contactId: contact.id,
              type: 'HOT_LEAD_THRESHOLD_CROSSED',
              score: newLeadScore,
              temperature: newTemperature,
              metadata: JSON.stringify({ threshold: HOT_LEAD_THRESHOLD, from: contact.leadScore, to: newLeadScore }),
            },
          })
          console.log(`[Core:15] 🔥 Hot-lead threshold crossed for ${contact.id} (${contact.leadScore} → ${newLeadScore})`)

          // ── AUTO-ASIGNACIÓN AL EQUIPO (2026-07-20): el lead CALIENTE se
          // asigna SOLO al siguiente vendedor (round-robin entre miembros con
          // rol 'member') y se le avisa por Telegram con el resumen. Se apaga
          // con settings.autoAssign = false. Si no hay vendedores, no hace nada
          // (el dueño ya recibió la alerta de lead caliente de arriba).
          try {
            const wsFresh = await db.workspace.findUnique({ where: { id: workspace.id }, select: { settings: true } })
            const s = (() => { try { return JSON.parse(wsFresh?.settings || '{}') } catch { return {} } })() as Record<string, unknown>
            if (s.autoAssign !== false && !conversation.assignedTo) {
              const sellers = await db.workspaceMember.findMany({
                where: { workspaceId: workspace.id, role: 'member' },
                orderBy: { joinedAt: 'asc' },
                include: { user: { select: { id: true, name: true, telegramChatId: true } } },
              })
              if (sellers.length > 0) {
                const i = (Number(s.autoAssignIdx) || 0) % sellers.length
                const pick = sellers[i]
                s.autoAssignIdx = (i + 1) % sellers.length
                await db.workspace.update({ where: { id: workspace.id }, data: { settings: JSON.stringify(s) } })
                await db.conversation.update({ where: { id: conversation.id }, data: { assignedTo: pick.userId } })
                await db.deal.updateMany({
                  where: { workspaceId: workspace.id, contactId: contact.id, status: 'active', assignedTo: null },
                  data: { assignedTo: pick.userId },
                }).catch(() => {})
                await logTimelineEvent({
                  workspaceId: workspace.id, contactId: contact.id, conversationId: conversation.id,
                  type: 'milestone', title: `🎯 Lead caliente asignado a ${pick.user?.name || 'vendedor'}`,
                  detail: 'Asignación automática (round-robin) al cruzar el umbral de lead caliente. El vendedor fue notificado.',
                  source: 'system', importance: 'high',
                }).catch(() => {})
                const tgMsg = `🎯 <b>Lead CALIENTE asignado a TI</b>\n👤 ${contactName}\n📱 ${phone}\n📊 Score: ${newLeadScore}/100\n💬 Último mensaje: "${(text || '').slice(0, 140)}"\n\n➡️ Ábrelo en Conversaciones y márcale antes de que se enfríe.`
                const wsBotToken = typeof s.telegramBotToken === 'string' && s.telegramBotToken ? s.telegramBotToken : undefined
                if (pick.user?.telegramChatId) {
                  void sendTelegramNotification(pick.user.telegramChatId, tgMsg, 'HTML', wsBotToken).catch(() => {})
                } else {
                  void broadcastToWorkspace(workspace.id, `${tgMsg}\n\n⚠️ ${pick.user?.name || 'El vendedor'} aún no vincula su Telegram — avísale directo.`).catch(() => {})
                }
                console.log(`[Core:AutoAssign] Lead ${contact.id} asignado a ${pick.user?.name || pick.userId} (round-robin #${i})`)
              }
            }
          } catch (err) {
            console.warn('[Core:AutoAssign] failed (non-critical):', (err as Error).message)
          }
        }
      } catch (err) {
        console.warn('[Core:15] hot-lead notify failed (non-critical):', (err as Error).message)
      }
    }

    // Detect close / noqualify actions → disable AI for this conversation immediately
    const closeAction = parsedCRMActions.find(a => a.type === 'close' || a.type === 'noqualify')
    if (closeAction && conversation) {
      const reason = closeAction.value || closeAction.type
      console.log(`[Core:CRM] ${closeAction.type.toUpperCase()} action detected (${reason}) — disabling AI for conv ${conversation.id}`)
      try {
        let convMeta: Record<string, unknown> = {}
        try { convMeta = JSON.parse(conversation.metadata || '{}') } catch {}
        convMeta.aiDisabled = true
        convMeta.aiDisabledReason = `${closeAction.type}:${reason}`
        convMeta.aiDisabledAt = new Date().toISOString()
        await db.conversation.update({
          where: { id: conversation.id },
          data: { metadata: JSON.stringify(convMeta) },
        })
        // For noqualify: also disable at contact level so the reactivation engine
        // never retries this person, even in a new conversation or channel.
        if (closeAction.type === 'noqualify' && contact) {
          try {
            let contactCF: Record<string, unknown> = {}
            try { contactCF = JSON.parse((contact as any).customFields || '{}') } catch {}
            contactCF.aiDisabled = true
            contactCF.aiDisabledReason = `noqualify:${reason}`
            contactCF.aiDisabledAt = new Date().toISOString()
            await db.contact.update({
              where: { id: contact.id },
              data: { customFields: JSON.stringify(contactCF) },
            })
            // Mark as not reactivable in lead profile (stops DIB reactivation engine)
            await db.leadProfile.updateMany({
              where: { contactId: contact.id },
              data: { isReactivable: false },
            }).catch(() => { /* profile may not exist yet */ })
            console.log(`[Core:CRM] Contact ${contact.id} permanently disabled (noqualify:${reason})`)
          } catch (err) {
            console.warn('[Core:CRM] Could not disable contact after noqualify:', (err as Error).message)
          }
        }
        // Cancel all pending follow-up tasks for this conversation
        // (excepto postventa: si ya compró, su secuencia post-sale sigue viva)
        await db.followUpTask.updateMany({
          where: { conversationId: conversation.id, status: 'pending', ruleId: { not: 'post-sale' } },
          data: { status: 'cancelled' },
        }).catch(err => console.warn('[Core:CRM] Could not cancel follow-ups:', err.message))
        // Bitácora: el descarte/cierre hecho POR LA IA queda en el expediente
        // (antes solo se avisaba por Telegram y el historial quedaba vacío).
        if (contact) {
          await logTimelineEvent({
            workspaceId: workspace.id, contactId: contact.id, conversationId: conversation.id,
            type: 'intention',
            title: closeAction.type === 'noqualify'
              ? `🚫 Lead descartado por la IA (${reason})`
              : `🔒 Conversación cerrada por la IA (${reason})`,
            detail: closeAction.type === 'noqualify'
              ? 'No es un cliente potencial (vendedor/spam/número equivocado). La IA ya no le escribirá; reversible desde el inbox.'
              : 'La IA cerró esta conversación y no continuará el seguimiento automático.',
            source: 'ai', importance: 'high',
          }).catch(() => {})
        }
      } catch (err) {
        console.warn('[Core:CRM] Could not disable AI after close/noqualify:', (err as Error).message)
      }
    } else {
      // Only schedule follow-up if conversation is NOT being closed AND lead is warm/hot.
      // Cold leads (score<20 or temp===cold) do NOT get automated follow-ups — this
      // prevents the CRM inconsistency where score:5+temp:cold still triggers a 24h reminder.
      const followupAction = parsedCRMActions.find(a => a.type === 'followup')
      if (followupAction && conversation) {
        const hoursMatch = followupAction.value.match(/^(\d+)h$/i)
        if (hoursMatch) {
          // FIX 2026-07-14 (reporte de Jhon: "no se disparan seguimientos nuevos"):
          // los leads FRÍOS —la mayoría de los nuevos— quedaban SIN un solo
          // seguimiento (se saltaban por completo) y son justo los que se enfrían
          // por falta de respuesta. Ahora TAMBIÉN se les agenda, con cadencia
          // suave: mínimo 24h. El freno anti-spam sigue mandando (tras 2 sin
          // respuesta el worker se detiene y marca 'desinteresado').
          const isCold = newLeadScore < 20 || newTemperature === 'cold'
          // GUARD: skip if contact already has a pending upcoming appointment
          const confirmedAppt = await db.appointment.findFirst({
            where: { contactId: contact.id, status: 'pending', date: { gte: new Date() } },
            select: { id: true, date: true },
          }).catch(() => null)
          if (confirmedAppt) {
            console.log(`[Core:CRM] Skipping follow-up — contact ${contact.id} has confirmed appointment on ${confirmedAppt.date.toISOString()}`)
          } else {
            // DEDUP: cancel any existing pending tasks before creating a new one
            // to prevent task accumulation when AI emits multiple [CRM:followup:Xh] tags
            const cancelledDup = await db.followUpTask.updateMany({
              where: { contactId: contact.id, status: 'pending', ruleId: { not: 'post-sale' } },
              data: { status: 'cancelled' },
            }).catch(() => ({ count: 0 }))
            if (cancelledDup.count > 0) {
              console.log(`[Core:CRM] Cancelled ${cancelledDup.count} duplicate pending follow-up(s) for contact ${contact.id}`)
            }
            const aiHours = parseInt(hoursMatch[1])
            const hours = isCold ? Math.max(aiHours, 24) : aiHours
            const scheduledAt = new Date(Date.now() + hours * 60 * 60 * 1000)
            await db.followUpTask.create({
              data: {
                workspaceId: workspace.id,
                ruleId: 'ai-generated',
                contactId: contact.id,
                conversationId: conversation.id,
                status: 'pending',
                scheduledAt,
                metadata: JSON.stringify({ tipo: isCold ? 'reactivacion_fria' : 'recordatorio_suave', step: 1, aiTriggered: true, coldLead: isCold }),
              },
            }).catch(err => console.warn('[Core:CRM] Could not schedule follow-up:', err.message))
            if (isCold) console.log(`[Core:CRM] Follow-up FRÍO agendado a ${hours}h (score:${newLeadScore}, temp:${newTemperature})`)
          }
        }
      }
    }

    // Update in-memory contact for step 11b
    contact.leadScore = newLeadScore

    // ── Auto-follow-up fallback: if AI replied to a warm+ lead but emitted no follow-up tag,
    // schedule step 0 of the 12-step timeline as a safety net.
    // This ensures we never silently lose a qualified lead just because the AI forgot the CRM tag.
    const isClosedOrDisqualified = parsedCRMActions.some(a => a.type === 'close' || a.type === 'noqualify')
    const aiScheduledFollowUp   = parsedCRMActions.some(a => a.type === 'followup')
    const isWarmOrHotter = newLeadScore >= 20 && newTemperature !== 'cold'
    if (!isClosedOrDisqualified && !aiScheduledFollowUp && isWarmOrHotter && conversation && aiReplyText) {
      try {
        const existingPending = await db.followUpTask.findFirst({
          where: { contactId: contact.id, status: 'pending' },
          select: { id: true },
        })
        if (!existingPending) {
          const { scheduleNextFollowUp } = await import('@/lib/ai/follow-up-engine')
          await scheduleNextFollowUp(contact.id, workspace.id, conversation.id, 0)
          console.log(`[Core:AutoFU] Scheduled step-0 follow-up for warm lead ${contact.id} (score:${newLeadScore})`)
        }
      } catch (err) {
        console.warn('[Core:AutoFU] Could not auto-schedule follow-up:', (err as Error).message)
      }
    }

    // Red de seguridad para FRÍOS sin tag de la IA: nadie se queda sin al menos
    // UN seguimiento (24h). Mismo pedido de Jhon: antes un lead nuevo frío que
    // no volvía a escribir desaparecía sin que el bot lo rescatara jamás.
    if (!isClosedOrDisqualified && !aiScheduledFollowUp && !isWarmOrHotter && conversation && aiReplyText) {
      try {
        const [existingPending, confirmedAppt] = await Promise.all([
          db.followUpTask.findFirst({ where: { contactId: contact.id, status: 'pending' }, select: { id: true } }),
          db.appointment.findFirst({ where: { contactId: contact.id, status: 'pending', date: { gte: new Date() } }, select: { id: true } }),
        ])
        if (!existingPending && !confirmedAppt) {
          await db.followUpTask.create({
            data: {
              workspaceId: workspace.id,
              ruleId: 'ai-generated',
              contactId: contact.id,
              conversationId: conversation.id,
              status: 'pending',
              scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              metadata: JSON.stringify({ tipo: 'reactivacion_fria', step: 1, aiTriggered: false, coldLead: true }),
            },
          })
          console.log(`[Core:AutoFU] Follow-up FRÍO de red de seguridad agendado a 24h para ${contact.id} (score:${newLeadScore})`)
        }
      } catch (err) {
        console.warn('[Core:AutoFU] Could not schedule cold follow-up:', (err as Error).message)
      }
    }
  }

  // ── 11b. Auto-create/update deal in pipeline ──
  if (contact) {
    const currentTags: string[] = JSON.parse(contact.tags || '[]')
    // If the AI explicitly emitted [CRM:stage:X], use that stage as override.
    // This means deal stage advances based on conversation quality, not just score.
    const stageAction = parsedCRMActions.find(a => a.type === 'stage')
    // Permiso por ficha del agente: si el agente ruteado tiene prohibido mover el
    // pipeline (NO puede updateDealStage), ignoramos su override de etapa.
    const canMoveStage = canRunTool(personalityName, 'updateDealStage', routedAgent?.forbiddenActions)
    if (stageAction && !canMoveStage) {
      console.warn(`[Core:11b] ${routedAgent?.name || personalityName} no puede mover el pipeline — se ignora [CRM:stage]`)
    }
    await autoCreateOrUpdateDeal({
      workspaceId: workspace.id,
      contactId: contact.id,
      conversationId: conversation.id,
      contactName: `${contact.firstName} ${contact.lastName || ''}`.trim(),
      leadScore: contact.leadScore,
      tags: currentTags,
      channel,
      overrideStage: canMoveStage ? stageAction?.value : undefined,
    })
  }

  // ── 11c. Create calendar appointment if AI confirmed one ──
  const appointmentAction = parsedCRMActions.find(a => a.type === 'appointment')
  if (appointmentAction && !canRunTool(personalityName, 'scheduleAppointment', routedAgent?.forbiddenActions)) {
    console.warn(`[Core:11c] ${routedAgent?.name || personalityName} no puede agendar citas (ficha NO puede) — se ignora [CRM:appointment]`)
  } else if (appointmentAction) {
    const parts = appointmentAction.value.split('|')
    const dateStr = parts[0]?.trim()
    if (dateStr) {
      try {
        // The AI emits a naive wall-clock (YYYY-MM-DDTHH:mm) in the business
        // timezone. Convert it to a real UTC instant using the workspace tz so
        // the stored time matches what was agreed regardless of server tz.
        const appointmentDate = zonedNaiveToUtc(dateStr, tzFromSettings(workspace.settings))
        if (!isNaN(appointmentDate.getTime()) && appointmentDate > new Date()) {
          const contactName = contact
            ? `${contact.firstName} ${contact.lastName || ''}`.trim()
            : 'Cliente'
          const title = parts[1]?.trim() || `Cita con ${contactName}`
          const rawType = parts[2]?.trim() || 'call'
          const validTypes = ['call', 'meeting', 'followup', 'task']
          const appointmentType = validTypes.includes(rawType) ? rawType : 'call'
          // Anti-duplicado: si el contacto ya tiene una cita pendiente futura,
          // la REAGENDAMOS (update) en vez de crear una segunda. Evita las
          // citas duplicadas cuando el lead re-confirma o cambia el horario.
          const existingAppt = contact?.id
            ? await db.appointment.findFirst({
                where: { contactId: contact.id, status: 'pending', date: { gte: new Date() } },
                orderBy: { date: 'asc' },
              })
            : null
          const appointment = existingAppt
            ? await db.appointment.update({
                where: { id: existingAppt.id },
                data: { title, date: appointmentDate, type: appointmentType },
              })
            : await db.appointment.create({
                data: {
                  workspaceId: workspace.id,
                  contactId: contact?.id || null,
                  title,
                  description: `Cita agendada automáticamente por el asistente IA`,
                  date: appointmentDate,
                  duration: 20,
                  type: appointmentType,
                  status: 'pending',
                },
              })
          if (existingAppt) {
            console.log(`[Core:11c] ↻ Cita existente ${existingAppt.id} reagendada (sin duplicar)`)
          } else if (routedAgent?.instanceId) {
            // F2 atribución: la cita se acredita al agente IA que la trabajó
            const { attributeAppointmentToAgent } = await import('@/lib/agent-factory/attribution')
            void attributeAppointmentToAgent(workspace.id, routedAgent.instanceId)
          }
          await sendAppointmentConfirmationIfPossible({
            contactId: contact?.id || null,
            contactName,
            businessName: workspace.name,
            title,
            date: appointmentDate,
            durationMinutes: 20,
            type: appointmentType,
            appointmentId: appointment.id,
          })
          // ── Section 15 — Appointment-booked notification ──
          // Fire-and-forget; never block the reply on Telegram latency.
          void notifyAppointmentBooked(workspace.id, {
            contactName,
            date: appointmentDate,
            title,
            appointmentId: appointment.id,
          })
          bookedAppointmentInfo = { title, date: appointmentDate.toISOString(), durationMin: 20 }
          console.log(`[Core:11c] ✅ Appointment created: ${title} at ${appointmentDate.toISOString()}`)
        } else {
          console.warn(`[Core:11c] Invalid or past appointment date: "${dateStr}"`)
        }
      } catch (err) {
        console.warn('[Core:11c] Could not create appointment:', (err as Error).message)
      }
    }
  }

  // ── 11c-fallback. Auto-confirm from stored proposal when AI confirmed but forgot the CRM tag ──
  // Pattern: no [CRM:appointment:...] emitted BUT the AI reply contains clear confirmation phrases
  // AND there's an unconfirmed proposal stored in conversation.metadata
  if (!appointmentAction && aiReplyText) {
    const CONFIRM_RE = /\b(confirmad[ao]|te espero|agendad[ao]|quedamos el|listo[,.]?\s*te\s+espero|cita confirmada|está\s+confirmad[ao])\b/i
    if (CONFIRM_RE.test(aiReplyText)) {
      let existingMeta: Record<string, unknown> = {}
      try { existingMeta = JSON.parse(conversation.metadata || '{}') } catch {}
      const proposal = existingMeta.apptProposal as { proposedDate?: string; time1?: string } | undefined
      if (proposal?.proposedDate && proposal?.time1) {
        try {
          const dtStr = `${proposal.proposedDate}T${proposal.time1}:00`
          const apptDate = zonedNaiveToUtc(dtStr, tzFromSettings(workspace.settings))
          if (!isNaN(apptDate.getTime()) && apptDate > new Date()) {
            const contactName = contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'Cliente'
            // Anti-duplicado: reagenda la cita pendiente futura si ya existe.
            const existingApptFb = contact?.id
              ? await db.appointment.findFirst({
                  where: { contactId: contact.id, status: 'pending', date: { gte: new Date() } },
                  orderBy: { date: 'asc' },
                })
              : null
            const appointment = existingApptFb
              ? await db.appointment.update({
                  where: { id: existingApptFb.id },
                  data: { title: `Llamada diagnóstico con ${contactName}`, date: apptDate, type: 'call' },
                })
              : await db.appointment.create({
                  data: {
                    workspaceId: workspace.id,
                    contactId: contact?.id || null,
                    title: `Llamada diagnóstico con ${contactName}`,
                    description: `Cita confirmada automáticamente por asistente IA (fallback)`,
                    date: apptDate,
                    duration: 20,
                    type: 'call',
                    status: 'pending',
                  },
                })
            if (!existingApptFb && routedAgent?.instanceId) {
              const { attributeAppointmentToAgent } = await import('@/lib/agent-factory/attribution')
              void attributeAppointmentToAgent(workspace.id, routedAgent.instanceId)
            }
            await sendAppointmentConfirmationIfPossible({
              contactId: contact?.id || null,
              contactName,
              businessName: workspace.name,
              title: `Llamada diagnóstico con ${contactName}`,
              date: apptDate,
              durationMinutes: 20,
              type: 'call',
              appointmentId: appointment.id,
            })
            delete existingMeta.apptProposal
            await db.conversation.update({
              where: { id: conversation.id },
              data: { metadata: JSON.stringify(existingMeta) },
            })
            // ── Section 15 — Appointment-booked notification (fallback path) ──
            void notifyAppointmentBooked(workspace.id, {
              contactName,
              date: apptDate,
              title: `Llamada diagnóstico con ${contactName}`,
              appointmentId: appointment.id,
            })
            bookedAppointmentInfo = { title: `Llamada diagnóstico con ${contactName}`, date: apptDate.toISOString(), durationMin: 20 }
            console.log(`[Core:11c-fb] ✅ Auto-confirmed appointment from proposal: ${dtStr}`)
          } else {
            console.warn(`[Core:11c-fb] Proposal date invalid or past: "${dtStr}"`)
          }
        } catch (err) {
          console.warn('[Core:11c-fb] Could not auto-confirm appointment:', (err as Error).message)
        }
      }
    }
  }

  // ── 11d. Persist appointment proposal state to conversation metadata ──
  {
    const proposeAction = parsedCRMActions.find(a => a.type === 'appt_propose')
    if (proposeAction) {
      const parts = proposeAction.value.split('|')
      const proposedDate = parts[0]?.trim()
      const time1 = parts[1]?.trim()
      const time2 = parts[2]?.trim()
      if (proposedDate) {
        try {
          let existingMeta: Record<string, unknown> = {}
          try { existingMeta = JSON.parse(conversation.metadata || '{}') } catch {}
          existingMeta.apptProposal = { proposedDate, time1: time1 || '', time2: time2 || '', proposedAt: new Date().toISOString() }
          await db.conversation.update({
            where: { id: conversation.id },
            data: { metadata: JSON.stringify(existingMeta) },
          })
          console.log(`[Core:11d] ✅ Proposal persisted in metadata: ${proposedDate} ${time1 || ''}${time2 ? '/' + time2 : ''}`)
        } catch (err) {
          console.warn('[Core:11d] Could not persist proposal:', (err as Error).message)
        }
      }
    } else if (appointmentAction) {
      // Lead confirmed a real appointment → clear the unconfirmed proposal from metadata
      try {
        let existingMeta: Record<string, unknown> = {}
        try { existingMeta = JSON.parse(conversation.metadata || '{}') } catch {}
        delete existingMeta.apptProposal
        await db.conversation.update({
          where: { id: conversation.id },
          data: { metadata: JSON.stringify(existingMeta) },
        })
        console.log(`[Core:11d] ✅ Cleared apptProposal from metadata (appointment confirmed)`)
      } catch { /* non-critical */ }
    }
  }

  // ── 12. Log agent interaction ──
  // Use getAgentForContact to route to the RIGHT agent (SELLER Pro, CERRADOR, etc.)
  // instead of always falling back to the first active agent (JHON).
  try {
    const routedAgentResult = contact ? await getAgentForContact(contact.id, workspace.id) : null
    const agentRecord = routedAgentResult
      ? { id: routedAgentResult.agentId }
      : await db.agent.findFirst({
          where: { workspaceId: workspace.id, isActive: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
    if (routedAgentResult) {
      console.log(`[Core:12] Routed to agent: ${routedAgentResult.agentName} (${routedAgentResult.agentType})`)
    }
    if (agentRecord) {
      const aiMx = engineResult.aiMetrics
      // Debug capture: when the workspace enables debugPrompts, persist the full
      // assembled prompt + raw model output so they can be inspected ("Depurar
      // respuesta"). Off by default to avoid DB bloat on every message.
      let debugMeta = '{}'
      try {
        const wsSettingsForDebug = typeof workspace.settings === 'string'
          ? JSON.parse(workspace.settings || '{}')
          : (workspace.settings || {})
        if (wsSettingsForDebug?.debugPrompts && aiMx?.systemPrompt) {
          debugMeta = JSON.stringify({
            debug: {
              systemPrompt: aiMx.systemPrompt.slice(0, 24000),
              analysisBlock: aiMx.analysisBlock ?? null,
              rawResponse: engineResult.response?.rawResponse?.slice(0, 8000) ?? null,
              capturedAt: new Date().toISOString(),
            },
          })
        }
      } catch { /* non-critical */ }

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
          model: aiMx?.model ?? null,
          tokensUsed: aiMx?.tokensUsed ?? 0,
          latencyMs: aiMx?.latencyMs ?? 0,
          metadata: debugMeta,
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

  // ── 14. Track lead activity (best send time prediction) ──
  if (contact?.id) {
    try {
      const now14 = new Date()
      const responseHour = now14.getHours()   // 0-23 in server TZ
      const responseDow  = now14.getDay()     // 0=Sun, 6=Sat
      await db.leadActivity.upsert({
        where: {
          workspaceId_contactId_responseHour_responseDow: {
            workspaceId: workspace.id,
            contactId: contact.id,
            responseHour,
            responseDow,
          },
        },
        update: { count: { increment: 1 } },
        create: {
          workspaceId: workspace.id,
          contactId: contact.id,
          responseHour,
          responseDow,
          count: 1,
        },
      })
    } catch (laErr) {
      console.warn('[Core:14] ⚠️ leadActivity.upsert failed (non-critical):', laErr instanceof Error ? laErr.message : laErr)
    }
  }

  // ── 15. Bitácora / Expediente Timeline (historial + trazabilidad) ──
  // Anota en orden cronológico los puntos importantes de la conversación:
  // intereses, intención, presupuesto, objeciones, puntos de dolor (gratis,
  // deterministas) + cita agendada + un resumen IA cada N mensajes.
  if (contact?.id) {
    try {
      if (leadProfileForTimeline) {
        await recordProfileTimeline(leadProfileForTimeline, { conversationId: conversation.id })
      }
      if (bookedAppointmentInfo) {
        await recordAppointmentTimeline({
          workspaceId: workspace.id,
          contactId: contact.id,
          conversationId: conversation.id,
          title: bookedAppointmentInfo.title,
          dateISO: bookedAppointmentInfo.date,
        })
      }
      // AI natural-language summary every N messages — only on plans where
      // profiling is enabled (leadProfileForTimeline set ⇒ Pro+), to avoid AI
      // cost on free tiers. Real inbound count drives the cadence (LeadProfile
      // .totalMessages only reflects the recent window, so it's unreliable here).
      if (leadProfileForTimeline) {
        const inboundCount = await db.message.count({
          where: { conversationId: conversation.id, direction: 'inbound' },
        })
        if (inboundCount > 0) {
          await maybeWriteAiSummary({
            workspaceId: workspace.id,
            contactId: contact.id,
            conversationId: conversation.id,
            totalMessages: inboundCount,
            provider: aiProvider,
            tenantApiKey,
          })
        }
      }
    } catch (timelineErr) {
      console.warn('[Core:15] ⚠️ bitácora timeline failed (non-critical):', timelineErr instanceof Error ? timelineErr.message : timelineErr)
    }
  }

  console.log(`[Core:✅] Done in ${Date.now() - start}ms | Reply: ${aiReplyText ? aiReplyText.length + ' chars' : 'NULL'}`)

  // Read final apptProposal state from metadata for the API response
  let apptMetadata: ProcessMessageResult['apptMetadata'] = null
  try {
    const finalMeta = JSON.parse((await db.conversation.findUnique({
      where: { id: conversation.id }, select: { metadata: true },
    }))?.metadata || '{}')
    apptMetadata = finalMeta.apptProposal ?? null
  } catch { /* non-critical */ }

  return {
    success: true,
    conversationId: conversation.id,
    contactId: contact?.id ?? null,
    aiReplyText,
    engineResult,
    latencyMs: Date.now() - start,
    parsedCRMTags: parsedCRMActions.map(a => ({ type: a.type, value: a.value })),
    apptMetadata,
    appointmentBooked: bookedAppointmentInfo,
    mediaToSend,
  }
}
