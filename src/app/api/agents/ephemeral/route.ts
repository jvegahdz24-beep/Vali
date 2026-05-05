import { NextRequest, NextResponse } from 'next/server'
import {
  spawnAgent,
  getActiveAgents,
  getAgentResult,
  expireAgent,
  expireStaleAgents,
  getAgentTemplates,
  getAgentTemplate,
  resolveAgentType,
  spawnFromEvent,
  type EphemeralAgentType,
} from '@/lib/ephemeral-agents'
import { logInfo, logWarn, logError } from '@/lib/logger'

// ─────────────────────────────────────────────────────────────
// GET /api/agents/ephemeral
// List agents, get templates, get agent result, get stats
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list'
    const workspaceId = searchParams.get('workspaceId')
    const contactId = searchParams.get('contactId')
    const agentId = searchParams.get('agentId')
    const agentType = searchParams.get('agentType') as EphemeralAgentType | null

    switch (action) {
      // ─── List active agents ──────────────────────────────
      case 'list':
      case 'active': {
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
        }

        const agents = await getActiveAgents(workspaceId, {
          agentType: agentType || undefined,
          contactId: contactId || undefined,
        })

        return NextResponse.json({ success: true, agents, total: agents.length })
      }

      // ─── Get a specific agent result ─────────────────────
      case 'result': {
        if (!agentId) {
          return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
        }

        const result = await getAgentResult(agentId)
        if (!result) {
          return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true, agent: result })
      }

      // ─── Get available templates ─────────────────────────
      case 'templates': {
        const templates = getAgentTemplates()
        const slim = templates.map((t) => ({
          type: t.type,
          name: t.name,
          description: t.description,
          icon: t.icon,
          spawnEvents: t.spawnEvents,
          objective: t.objective,
        }))

        return NextResponse.json({ success: true, templates: slim })
      }

      // ─── Get a single template ───────────────────────────
      case 'template': {
        if (!agentType) {
          return NextResponse.json({ error: 'agentType is required' }, { status: 400 })
        }

        const template = getAgentTemplate(agentType)
        if (!template) {
          return NextResponse.json({ error: `Unknown agent type: ${agentType}` }, { status: 404 })
        }

        return NextResponse.json({ success: true, template })
      }

      // ─── Resolve agent type from event ──────────────────
      case 'resolve': {
        const eventType = searchParams.get('eventType')
        if (!eventType) {
          return NextResponse.json({ error: 'eventType is required' }, { status: 400 })
        }

        const resolvedType = resolveAgentType(eventType)
        return NextResponse.json({
          success: true,
          eventType,
          agentType: resolvedType,
        })
      }

      // ─── Stats summary ──────────────────────────────────
      case 'stats': {
        if (!workspaceId) {
          return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
        }

        // Expire stale agents first
        const expiredCount = await expireStaleAgents()

        const allActive = await getActiveAgents(workspaceId)
        const byType: Record<string, number> = {}
        for (const agent of allActive) {
          byType[agent.agentType] = (byType[agent.agentType] || 0) + 1
        }

        const templates = getAgentTemplates()

        return NextResponse.json({
          success: true,
          stats: {
            activeAgents: allActive.length,
            justExpired: expiredCount,
            byType,
            availableTemplates: templates.length,
          },
        })
      }

      default:
        return NextResponse.json({
          error: 'Invalid action. Use: list, active, result, templates, template, resolve, stats',
        }, { status: 400 })
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logError('AI', 'get_error', error)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/agents/ephemeral
// Spawn, expire, or event-trigger an ephemeral agent
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    switch (action) {
      // ─── Spawn a new agent ────────────────────────────────
      case 'spawn': {
        const {
          agentType,
          workspaceId,
          contactId,
          spawnReason,
          context,
        } = body as {
          agentType: EphemeralAgentType
          workspaceId: string
          contactId?: string
          spawnReason?: string
          context?: Record<string, unknown>
        }

        if (!agentType || !workspaceId) {
          return NextResponse.json({
            error: 'agentType and workspaceId are required',
          }, { status: 400 })
        }

        // Validate agent type
        const template = getAgentTemplate(agentType)
        if (!template) {
          return NextResponse.json({
            error: `Invalid agent type: ${agentType}. Valid types: ${getAgentTemplates().map((t) => t.type).join(', ')}`,
          }, { status: 400 })
        }

        const result = await spawnAgent({
          workspaceId,
          contactId,
          agentType,
          spawnReason: spawnReason || 'Manual spawn via API',
          context,
        })

        logInfo('AI', 'agent_spawned', {
          agentId: result.agentId,
          type: result.agentType,
          confidence: result.confidence,
          actionsCount: result.actions.length,
        })

        return NextResponse.json({
          success: true,
          agent: result,
          message: `Agente ${template.name} (${agentType}) generado exitosamente`,
        })
      }

      // ─── Spawn from event (auto-resolve agent type) ────────
      case 'event': {
        const {
          eventType,
          workspaceId,
          contactId,
          eventContext,
        } = body as {
          eventType: string
          workspaceId: string
          contactId?: string
          eventContext?: Record<string, unknown>
        }

        if (!eventType || !workspaceId) {
          return NextResponse.json({
            error: 'eventType and workspaceId are required',
          }, { status: 400 })
        }

        const result = await spawnFromEvent(eventType, workspaceId, contactId, eventContext)

        if (!result) {
          return NextResponse.json({
            success: false,
            message: `No agent template matches event type: ${eventType}`,
          }, { status: 200 })
        }

        logInfo('AI', 'agent_spawned_from_event', {
          eventType,
          agentId: result.agentId,
          type: result.agentType,
        })

        return NextResponse.json({
          success: true,
          agent: result,
          eventType,
          message: `Agente generado por evento: ${eventType}`,
        })
      }

      // ─── Force-expire an agent ────────────────────────────
      case 'expire': {
        const { agentId } = body as { agentId: string }

        if (!agentId) {
          return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
        }

        const success = await expireAgent(agentId)
        if (!success) {
          return NextResponse.json({ error: 'Agent not found or already expired/completed' }, { status: 404 })
        }

        logInfo('AI', 'agent_expired', { agentId })

        return NextResponse.json({
          success: true,
          message: `Agente ${agentId} expirado correctamente`,
        })
      }

      // ─── Expire all stale agents ──────────────────────────
      case 'expire-stale': {
        const count = await expireStaleAgents()

        logInfo('AI', 'batch_expired', { count })

        return NextResponse.json({
          success: true,
          expired: count,
          message: `${count} agentes expirados por inactividad o tiempo límite`,
        })
      }

      default:
        return NextResponse.json({
          error: 'Acción inválida. Usa: spawn, event, expire, o expire-stale',
        }, { status: 400 })
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logError('AI', 'post_error', error)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
