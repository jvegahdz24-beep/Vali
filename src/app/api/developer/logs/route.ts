import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// In-memory log store for runtime events (API key tests, debug console, etc.)
interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

const runtimeLogs: Map<string, LogEntry[]> = new Map()

// SSE subscribers: workspaceId → Set of controllers
const sseSubscribers: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>> = new Map()

// Add a runtime log entry for a workspace (called from other routes)
export function addDeveloperLog(
  level: 'info' | 'warn' | 'error',
  source: string,
  message: string,
  workspaceId?: string,
) {
  const entry: LogEntry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  }
  const key = workspaceId ?? '__global__'
  const existing = runtimeLogs.get(key) ?? []
  existing.unshift(entry)
  if (existing.length > 200) existing.length = 200
  runtimeLogs.set(key, existing)

  // Broadcast to SSE subscribers
  const subscribers = sseSubscribers.get(key)
  if (subscribers) {
    const payload = new TextEncoder().encode(`data: ${JSON.stringify(entry)}\n\n`)
    for (const ctrl of subscribers) {
      try { ctrl.enqueue(payload) } catch { /* subscriber disconnected */ }
    }
  }

  return entry
}

/** Subscribe an SSE controller for a workspace. Returns an unsubscribe function. */
export function subscribeToLogs(
  workspaceId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): () => void {
  const key = workspaceId
  if (!sseSubscribers.has(key)) sseSubscribers.set(key, new Set())
  sseSubscribers.get(key)!.add(controller)
  return () => sseSubscribers.get(key)?.delete(controller)
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') ?? ''
    const level = searchParams.get('level') as 'info' | 'warn' | 'error' | null
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)

    await requireWorkspace(workspaceId, session.userId)

    // Pull real data from DB in parallel
    const [agentLogs, automationLogs, engineEvents] = await Promise.all([
      db.agentLog.findMany({
        where: { agent: { workspaceId } },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          createdAt: true,
          inputMessage: true,
          outputMessage: true,
          model: true,
          tokensUsed: true,
          latencyMs: true,
          error: true,
          action: true,
          agent: { select: { name: true } },
          conversation: { select: { id: true } },
        },
      }),
      db.automationLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          createdAt: true,
          status: true,
          action: true,
          message: true,
          contactName: true,
          automation: { select: { name: true } },
        },
      }),
      db.engineEvent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          createdAt: true,
          type: true,
          subType: true,
          score: true,
          temperature: true,
          metadata: true,
        },
      }),
    ])

    const dbLogs: LogEntry[] = []

    // Map AgentLogs
    for (const l of agentLogs) {
      const isError = !!l.error
      dbLogs.push({
        id: l.id,
        timestamp: l.createdAt.toISOString(),
        level: isError ? 'error' : 'info',
        source: 'ai-engine',
        message: isError
          ? `[${l.agent.name}] Error: ${l.error?.slice(0, 120)} — conv #${l.conversation.id.slice(-6)}`
          : `[${l.agent.name}] ${l.action ?? 'Mensaje procesado'} — ${l.model ?? 'model'} — ${l.tokensUsed} tokens — ${l.latencyMs}ms — conv #${l.conversation.id.slice(-6)}`,
      })
    }

    // Map AutomationLogs
    for (const l of automationLogs) {
      const isFailed = l.status === 'failed'
      const contactPart = l.contactName ? ` — Contacto: ${l.contactName}` : ''
      dbLogs.push({
        id: l.id,
        timestamp: l.createdAt.toISOString(),
        level: isFailed ? 'error' : 'info',
        source: 'automation',
        message: `[${l.automation.name}] ${l.action ?? l.message ?? l.status}${contactPart}`,
      })
    }

    // Map EngineEvents
    for (const e of engineEvents) {
      let msg = `${e.type}`
      if (e.subType) msg += ` / ${e.subType}`
      if (e.score !== null && e.score !== undefined) msg += ` — Score: ${e.score}`
      if (e.temperature) msg += ` — Temp: ${e.temperature}`
      dbLogs.push({
        id: e.id,
        timestamp: e.createdAt.toISOString(),
        level: 'info',
        source: 'crm',
        message: msg,
      })
    }

    // Merge runtime in-memory logs for this workspace
    const runtime = runtimeLogs.get(workspaceId) ?? []
    const allLogs = [...runtime, ...dbLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )

    let filtered = allLogs
    if (level && ['info', 'warn', 'error'].includes(level)) {
      filtered = filtered.filter(l => l.level === level)
    }

    return Response.json({
      success: true,
      logs: filtered.slice(0, limit),
      total: filtered.length,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request)
    const body = await request.json()
    const { level, source, message } = body

    if (!level || !source || !message) {
      return Response.json(
        { success: false, error: 'Missing required fields: level, source, message' },
        { status: 400 }
      )
    }

    const entry = addDeveloperLog(level, source, message)

    return Response.json({ success: true, log: entry })
  } catch (error) {
    return errorResponse(error)
  }
}
