import { NextRequest } from 'next/server'
import { orchestrator, getOrchestratorStats } from '@/lib/orchestrator'
import {
  ApiError,
  errorResponse,
  getClientIp,
  requireAuth,
  requirePermission,
  requireWorkspace,
} from '@/lib/api-auth'
import { db } from '@/lib/db'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import type { ActiveMode } from '@/lib/orchestrator'

const MAX_MESSAGE_LENGTH = 4_000
const MAX_HISTORY_ITEMS = 20
const MAX_HISTORY_CONTENT_LENGTH = 2_000
const MAX_TAGS = 20
const MAX_TAG_LENGTH = 80
const MAX_CONTEXT_LENGTH = 160
const ALLOWED_MODES: ActiveMode[] = ['valiautoflow', 'nexus', 'blended']

function optionalString(value: unknown, maxLength = MAX_CONTEXT_LENGTH): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ApiError(400, 'El formato de la solicitud no es válido.', 'INVALID_INPUT')
  }
  return value.trim() || undefined
}

function parseHistory(value: unknown): Array<{ role: string; content: string }> {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_HISTORY_ITEMS) {
    throw new ApiError(400, 'El historial de conversación no es válido.', 'INVALID_INPUT')
  }

  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, 'El historial de conversación no es válido.', 'INVALID_INPUT')
    }

    const role = (item as { role?: unknown }).role
    const content = (item as { content?: unknown }).content
    if (
      typeof role !== 'string' ||
      !['user', 'assistant', 'system'].includes(role) ||
      typeof content !== 'string' ||
      !content.trim() ||
      content.length > MAX_HISTORY_CONTENT_LENGTH
    ) {
      throw new ApiError(400, 'El historial de conversación no es válido.', 'INVALID_INPUT')
    }

    return { role, content: content.trim() }
  })
}

function parseTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (
    !Array.isArray(value) ||
    value.length > MAX_TAGS ||
    value.some((tag) => typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH)
  ) {
    throw new ApiError(400, 'Las etiquetas no son válidas.', 'INVALID_INPUT')
  }
  return value.map((tag) => tag.trim()).filter(Boolean)
}

function parseLeadScore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ApiError(400, 'El leadScore no es válido.', 'INVALID_INPUT')
  }
  return value
}

function publicResult(result: Awaited<ReturnType<typeof orchestrator.processMessage>>) {
  return {
    response: result.response,
    mode: result.mode,
    intent: result.intent,
    confidence: result.confidence,
    valiautoflowAgent: result.valiautoflowAgent,
    valiautoflowStage: result.valiautoflowStage,
  }
}

// POST /api/orchestrator/chat — Process a message through the dual-agent orchestrator.
// This is an authenticated internal workspace endpoint, not a public AI proxy.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const ip = getClientIp(request)
    const rl = rateLimit(
      `${ip}:orchestrator:chat:${session.userId}`,
      RATE_LIMITS.aiChat.limit,
      RATE_LIMITS.aiChat.windowMs,
    )
    if (!rl.success) {
      return Response.json(
        { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      throw new ApiError(400, 'El cuerpo de la solicitud no es JSON válido.', 'INVALID_JSON')
    }

    const message = body.message
    if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH) {
      throw new ApiError(400, 'El mensaje es obligatorio y debe tener un tamaño válido.', 'INVALID_INPUT')
    }

    const requestedWorkspaceId = optionalString(body.workspaceId, 128) ?? session.workspaceId
    if (!requestedWorkspaceId) {
      throw new ApiError(400, 'workspaceId es requerido.', 'WORKSPACE_REQUIRED')
    }

    const member = await requireWorkspace(requestedWorkspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')

    const contactId = optionalString(body.contactId, 128)
    if (contactId) {
      const contact = await db.contact.findFirst({
        where: { id: contactId, workspaceId: requestedWorkspaceId },
        select: { id: true },
      })
      if (!contact) {
        throw new ApiError(404, 'Contacto no encontrado.', 'CONTACT_NOT_FOUND')
      }
    }

    const forceMode = body.forceMode
    if (forceMode !== undefined && (!ALLOWED_MODES.includes(forceMode as ActiveMode))) {
      throw new ApiError(400, 'El modo solicitado no es válido.', 'INVALID_INPUT')
    }

    const leadScore = parseLeadScore(body.leadScore)
    const language = optionalString(body.language, 32)
    const contactName = optionalString(body.contactName)
    const businessName = optionalString(body.businessName)
    const industry = optionalString(body.industry)
    const tags = parseTags(body.tags)
    const conversationHistory = parseHistory(body.conversationHistory)

    const result = await orchestrator.processMessage({
      message: message.trim(),
      contactId,
      workspaceId: requestedWorkspaceId,
      conversationHistory,
      contactName,
      leadScore,
      tags,
      forceMode: forceMode as ActiveMode | undefined,
      language,
      businessName,
      industry,
    })

    // Never expose reasoning, events, profile context, model names, token counts,
    // latency or provider diagnostics to the browser/client channel.
    return Response.json(publicResult(result))
  } catch (error) {
    return errorResponse(error)
  }
}

// GET /api/orchestrator/chat — Get internal orchestrator stats.
// Stats are protected and intentionally not exposed as a public endpoint.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const workspaceId = session.workspaceId
    if (!workspaceId) {
      throw new ApiError(400, 'workspaceId es requerido.', 'WORKSPACE_REQUIRED')
    }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')
    return Response.json({ stats: getOrchestratorStats() })
  } catch (error) {
    return errorResponse(error)
  }
}
