// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow CRM v3.0 — Agent Think Endpoint
// POST /api/agent/think — Send a message through the cognitive loop
// GET  /api/agent/think — Get current cognitive status for a workspace
//
// This route exposes the AgentRuntime cognitive pipeline to the
// frontend. It handles intent classification, cognitive gating,
// tool execution, and emotional response generation in a single call.
//
// Cognitive Loop (7 steps):
//   1. Receive user message
//   2. Classify intent (IntentClassifier)
//   3. Synthesize cognitive state (CognitiveStateManager)
//   4. Decide: respond-only or execute tool (CognitiveRuntime.gate)
//   5. Execute tools if approved (ExecutionPipeline)
//   6. Generate response with emotional modifiers (ResponseGenerator)
//   7. Update memory + cognitive feedback
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { agentThink, getAgentCognitiveStatus } from '@/agent-runtime'
import type { AgentThinkRequest } from '@/agent-runtime'
import {
  requireAuth,
  requireWorkspace,
  errorResponse,
  getClientIp,
} from '@/lib/api-auth'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'

// ─────────────────────────────────────────────────────────────
// POST /api/agent/think
// Process a user message through the full AgentRuntime cognitive loop.
//
// Request body:
//   workspaceId          (string, required) — Target workspace
//   message              (string, required) — User message to process
//   contactId            (string, optional) — Contact context
//   sessionId            (string, optional) — Continue existing session
//   agentId              (string, optional) — Override agent identity
//   personality          (string, optional) — Personality override (e.g. "JHON")
//   provider             (string, optional) — LLM provider override (e.g. "glm")
//   conversationHistory  (AgentMessage[], optional) — Prior messages for context
//
// Returns AgentThinkResponse:
//   response           — Generated text response
//   turn               — Full conversation turn record
//   intent             — Classified intent result (or null)
//   cognitiveSnapshot  — Agent's cognitive state at time of response
//   toolExecutions     — Any tools that were executed
//   decision           — What the agent decided to do
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Rate limit per IP to prevent abuse
    const ip = getClientIp(req)
    const rl = await rateLimit(
      `${ip}:agent:think`,
      RATE_LIMITS.aiChat.limit,
      RATE_LIMITS.aiChat.windowMs,
    )
    if (!rl.success) {
      return Response.json(
        { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
        { status: 429 },
      )
    }

    // Authenticate the user
    const session = await requireAuth(req)

    // Parse request body
    const body = await req.json()
    const {
      workspaceId,
      message,
      contactId,
      sessionId,
      agentId,
      personality,
      provider,
      conversationHistory,
    } = body as AgentThinkRequest

    // ── Validate required fields ──
    if (!workspaceId || typeof workspaceId !== 'string') {
      return Response.json(
        { error: 'Missing required field: workspaceId' },
        { status: 400 },
      )
    }

    if (!message || typeof message !== 'string') {
      return Response.json(
        { error: 'Missing required field: message' },
        { status: 400 },
      )
    }

    // Verify the user has access to this workspace
    await requireWorkspace(workspaceId, session.userId)

    // ── Build the think request ──
    const thinkRequest: AgentThinkRequest = {
      workspaceId,
      message,
      contactId: contactId || undefined,
      sessionId: sessionId || undefined,
      agentId: agentId || undefined,
      personality: personality || undefined,
      provider: provider || undefined,
      conversationHistory: Array.isArray(conversationHistory)
        ? conversationHistory
        : undefined,
    }

    // ── Execute the cognitive loop ──
    const result = await agentThink(thinkRequest)

    return Response.json({
      success: true,
      ...result,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/agent/think?workspaceId=ws_xxx
// Retrieve the agent's current cognitive status for a workspace.
//
// Query params:
//   workspaceId  (string, required) — Target workspace
//
// Returns:
//   snapshot       — CognitiveSnapshot with load, coherence, emotional state, etc.
//   attentionPlan — Whether the agent can accept new tasks, current focus, recommendation
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // Authenticate the user
    const session = await requireAuth(req)

    // Parse query parameters
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return Response.json(
        { error: 'Missing required query parameter: workspaceId' },
        { status: 400 },
      )
    }

    // Verify the user has access to this workspace
    await requireWorkspace(workspaceId, session.userId)

    // ── Fetch cognitive status ──
    const status = await getAgentCognitiveStatus(workspaceId)

    return Response.json({
      success: true,
      ...status,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
