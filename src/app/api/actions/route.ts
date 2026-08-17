// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Action Execution API
// POST /api/actions — Execute actions & report outcomes
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { interpretLeadMemory } from '@/lib/engine/memory'
import type { ActionType } from '@/lib/engine/types'
import { chatWithAI } from '@/lib/ai/providers'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { humanizeResponse } from '@/lib/ai/humanizer'

// Action effects configuration
const ACTION_EFFECTS: Record<
  string,
  {
    scoreDelta: number
    tempChange?: string
    expectedOutcome: string
    deadline: number // minutes
    ifNotMet: ActionType
  }
> = {
  SEND_FOLLOW_UP: {
    scoreDelta: 5,
    expectedOutcome: 'Respuesta del lead en 2h',
    deadline: 120,
    ifNotMet: 'SEND_AGGRESSIVE_FOLLOWUP',
  },
  SEND_PROPOSAL: {
    scoreDelta: 10,
    tempChange: 'warm',
    expectedOutcome: 'Lead revisa propuesta y responde en 4h',
    deadline: 240,
    ifNotMet: 'CALL_NOW',
  },
  CALL_NOW: {
    scoreDelta: 15,
    tempChange: 'hot',
    expectedOutcome: 'Contacto directo con el lead en 30min',
    deadline: 30,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  SCHEDULE_MEETING: {
    scoreDelta: 20,
    tempChange: 'hot',
    expectedOutcome: 'Reunión confirmada en 24h',
    deadline: 1440,
    ifNotMet: 'CALL_NOW',
  },
  SEND_AGGRESSIVE_FOLLOWUP: {
    scoreDelta: 8,
    expectedOutcome: 'Respuesta inmediata o ghost confirmado',
    deadline: 0,
    ifNotMet: 'REACTIVATE',
  },
  REACTIVATE: {
    scoreDelta: 3,
    expectedOutcome: 'Lead responde o confirma desinterés',
    deadline: 180,
    ifNotMet: 'MARK_LOST',
  },
  UPDATE_SCORE: {
    scoreDelta: 0,
    expectedOutcome: 'Score actualizado',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  MARK_WON: {
    scoreDelta: 100,
    tempChange: 'hot',
    expectedOutcome: 'Venta cerrada',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  MARK_LOST: {
    scoreDelta: -100,
    tempChange: 'cold',
    expectedOutcome: 'Lead descartado',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
  LOG_NOTE: {
    scoreDelta: 0,
    expectedOutcome: 'Nota registrada',
    deadline: 0,
    ifNotMet: 'SEND_FOLLOW_UP',
  },
}

// ─── Action-specific system prompts ───────────────────────────
const ACTION_PROMPTS: Partial<Record<ActionType, string>> = {
  SEND_FOLLOW_UP:
    'Eres un vendedor profesional y amigable. Genera UN solo mensaje de WhatsApp de seguimiento suave para este lead. ' +
    'El objetivo es retomar la conversación de forma no invasiva. ' +
    'Usa el nombre del lead, sé breve (máximo 2 líneas), no menciones precios, termina con una pregunta abierta.',
  SEND_AGGRESSIVE_FOLLOWUP:
    'Eres un vendedor con urgencia real. Genera UN solo mensaje de WhatsApp directo y con sentido de escasez para este lead. ' +
    'Crea urgencia genuina (disponibilidad limitada, oferta por tiempo). ' +
    'Usa el nombre del lead, máximo 3 líneas, termina con un CTA claro.',
  REACTIVATE:
    'Eres un vendedor inteligente. Genera UN solo mensaje de reactivación para un lead que lleva días sin responder. ' +
    'Usa un ángulo de curiosidad o valor agregado nuevo — no presiones. ' +
    'Usa el nombre del lead, máximo 2 líneas, despierta interés sin vender.',
  SEND_PROPOSAL:
    'Eres un asesor de ventas. Genera UN solo mensaje de WhatsApp presentando una propuesta personalizada para este lead. ' +
    'Menciona brevemente el beneficio principal. ' +
    'Usa el nombre del lead, máximo 3 líneas, incluye CTA para agendar o responder.',
}

const SEND_ACTIONS = new Set<ActionType>(['SEND_FOLLOW_UP', 'SEND_AGGRESSIVE_FOLLOWUP', 'REACTIVATE', 'SEND_PROPOSAL'])

/**
 * Generates an AI follow-up message and sends it via WhatsApp.
 * Returns the generated text (or null if generation fails).
 */
async function generateAndSend(
  action: ActionType,
  contactId: string,
  workspaceId: string,
  contact: { phone: string | null; firstName: string | null; leadScore: number | null; temperature: string | null; leadProfile: { archetype: string | null; score: number | null } | null }
): Promise<string | null> {
  try {
    const systemPromptBase = ACTION_PROMPTS[action]
    if (!systemPromptBase) return null

    // Get active agent for AI provider
    const agent = await db.agent.findFirst({
      where: { workspaceId, isActive: true },
      select: { model: true, modelName: true, temperature: true, systemPrompt: true },
    })
    const provider = agent?.model || 'glm'

    // Get recent conversation history
    const conversation = await db.conversation.findFirst({
      where: { workspaceId, contactId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (conversation) {
      const msgs = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { direction: true, content: true },
      })
      msgs.reverse().forEach(m => {
        historyMessages.push({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: m.content,
        })
      })
    }

    const leadCtx = [
      `Lead: ${contact.firstName || 'Cliente'}`,
      contact.leadProfile?.archetype ? `Perfil: ${contact.leadProfile.archetype}` : '',
      contact.temperature ? `Temperatura: ${contact.temperature}` : '',
      contact.leadScore != null ? `Score: ${contact.leadScore}` : '',
    ].filter(Boolean).join(' | ')

    const systemPrompt = `${systemPromptBase}\n\nContexto del lead: ${leadCtx}\nResponde ÚNICAMENTE con el texto del mensaje, sin comillas, sin etiquetas, sin explicaciones.`

    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: `Genera el mensaje de ${action.toLowerCase().replace(/_/g, ' ')} para ${contact.firstName || 'este lead'}.` },
    ]

    // disableThinking: GLM is a reasoning model — without this (and with a
    // small token budget) it can spend the budget on chain-of-thought, leave
    // `content` empty, and the extractor falls back to reasoning_content →
    // the bot's internal deliberation gets sent to the customer. Disabling
    // thinking + a larger budget guarantees a clean, direct message.
    const result = await chatWithAI(aiMessages, provider, undefined, { temperature: 0.7, maxTokens: 512, disableThinking: true })
    let generatedText = humanizeResponse(result.content.trim())

    // Safety net: if the model still leaked reasoning (prose ABOUT the message
    // instead of the message), drop it rather than send garbage to the lead.
    const looksLikeReasoning = /\b(el usuario quiere|bas[aá]ndome|basado en el historial|considerando que|el mensaje debe|voy a (generar|redactar)|aqu[ií] (tienes|est[aá]) (el|un) mensaje)\b/i
    if (looksLikeReasoning.test(generatedText)) {
      console.warn('[Actions] Discarded leaked-reasoning follow-up text')
      return null
    }
    if (!generatedText) return null

    // Send via WhatsApp if connected
    let waSent = false
    if (contact.phone) {
      try {
        const manager = getWhatsAppManager(workspaceId)
        if (manager.isConnected()) {
          const sendResult = await manager.sendMessage(contact.phone, generatedText)
          waSent = sendResult.success
        }
      } catch (waErr) {
        console.warn('[Actions] WhatsApp send failed:', waErr instanceof Error ? waErr.message : waErr)
      }
    }

    // Save message to DB
    if (conversation) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          content: generatedText,
          type: 'text',
          direction: 'outbound',
          senderType: 'agent',
          isAiGenerated: true,
          metadata: JSON.stringify({ type: 'action_followup', action, waSent }),
        },
      })
    }

    console.log(`[Actions] ${action} → AI generated (${generatedText.length} chars), waSent=${waSent}`)
    return generatedText
  } catch (err) {
    console.error('[Actions] generateAndSend error:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { contactId, action, workspaceId, outcome } = body as {
      contactId: string
      action: ActionType
      workspaceId: string
      outcome?: string
    }

    if (!contactId || !workspaceId) {
      return NextResponse.json(
        { error: 'contactId y workspaceId requeridos' },
        { status: 400 }
      )
    }

    const contact = await db.contact.findUnique({
      where: { id: contactId },
      include: { leadProfile: true },
    })

    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      )
    }

    // ─── CASE 1: Reporting an action outcome ────
    if (outcome) {
      await db.engineEvent.create({
        data: {
          workspaceId,
          contactId,
          type: 'ACTION_OUTCOME',
          subType: outcome,
          metadata: JSON.stringify({
            reportedBy: session.userId,
            reportedAt: new Date().toISOString(),
          }),
          score: contact.leadScore,
          temperature: contact.temperature,
        },
      })

      // Re-evaluate memory
      const newMemory = await interpretLeadMemory(contactId, workspaceId)

      return NextResponse.json({
        success: true,
        outcome,
        memory: newMemory,
        jhonSays: newMemory.nextBestAction.jhonSays,
      })
    }

    // ─── CASE 2: Executing an action ────────────
    if (!action) {
      return NextResponse.json(
        { error: 'action o outcome requeridos' },
        { status: 400 }
      )
    }

    const effect = ACTION_EFFECTS[action] || ACTION_EFFECTS.SEND_FOLLOW_UP

    // Update contact
    const updateData: Record<string, any> = {}
    if (effect.scoreDelta !== 0) {
      updateData.leadScore = Math.max(
        0,
        Math.min(100, (contact.leadScore || 0) + effect.scoreDelta)
      )
    }
    if (effect.tempChange) {
      updateData.temperature = effect.tempChange
    }
    if (action === 'CALL_NOW' || action === 'SCHEDULE_MEETING') {
      updateData.lastMessageAt = new Date()
    }

    if (Object.keys(updateData).length > 0) {
      await db.contact.update({
        where: { id: contactId },
        data: updateData,
      })
    }

    // Log the action event
    await db.engineEvent.create({
      data: {
        workspaceId,
        contactId,
        type: 'ACTION_EXECUTED',
        subType: action,
        metadata: JSON.stringify({
          scoreDelta: effect.scoreDelta,
          expectedOutcome: effect.expectedOutcome,
          deadline: effect.deadline,
          ifNotMet: effect.ifNotMet,
          executedBy: session.userId,
        }),
        score: updateData.leadScore ?? contact.leadScore,
        temperature: updateData.temperature ?? contact.temperature,
      },
    })

    // Also log as recommended action (for auto-action deadline tracking)
    if (effect.deadline > 0) {
      await db.engineEvent.create({
        data: {
          workspaceId,
          contactId,
          type: 'ACTION_RECOMMENDED',
          subType: effect.ifNotMet,
          metadata: JSON.stringify({
            action,
            expectedOutcome: effect.expectedOutcome,
            deadline: effect.deadline,
            ifNotMet: effect.ifNotMet,
          }),
          score: updateData.leadScore ?? contact.leadScore,
          temperature: updateData.temperature ?? contact.temperature,
        },
      })
    }

    // Re-evaluate memory
    const newMemory = await interpretLeadMemory(contactId, workspaceId)

    // Generate AI message + send via WhatsApp for actions that require it
    let generatedMessage: string | null = null
    if (SEND_ACTIONS.has(action)) {
      generatedMessage = await generateAndSend(action, contactId, workspaceId, contact)
    }

    // Build jhon response
    let jhonResponse: string
    if (generatedMessage) {
      jhonResponse = generatedMessage
    } else if (action === 'SEND_AGGRESSIVE_FOLLOWUP') {
      jhonResponse =
        'Estrategia agresiva activada. Si no hay respuesta, este lead entra en modo reactivación.'
    } else if (action === 'CALL_NOW') {
      jhonResponse =
        'Llamada registrada. Si no responde en 30 min, Jhon sugerirá seguimiento.'
    } else {
      jhonResponse =
        effect.deadline > 0
          ? `Acción ejecutada. Si no hay respuesta en ${effect.deadline >= 60 ? Math.round(effect.deadline / 60) + 'h' : effect.deadline + 'min'}, Jhon actuará automáticamente.`
          : 'Acción ejecutada.'
    }

    return NextResponse.json({
      success: true,
      action,
      scoreDelta: effect.scoreDelta,
      newScore: updateData.leadScore ?? contact.leadScore,
      expectedOutcome: effect.expectedOutcome,
      deadline: effect.deadline,
      autoActionWillTrigger: effect.deadline > 0,
      messageSent: !!generatedMessage,
      message: generatedMessage ?? undefined,
      memory: newMemory,
      jhonSays: newMemory.nextBestAction.jhonSays,
      jhonResponse,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
