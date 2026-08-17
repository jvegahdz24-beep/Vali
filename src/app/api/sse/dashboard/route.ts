// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — SSE: Real-Time Dashboard Events
// GET /api/sse/dashboard?workspaceId=...
// Streams Server-Sent Events to the client dashboard:
//   - deal.stage.changed
//   - message.received
//   - automation.executed
//   - ping (keep-alive, every 30s)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-edge'
import { subscribe, type EventMap } from '@/lib/event-bus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Events to forward over SSE (must match keys of EventMap)
const DASHBOARD_EVENTS = [
  'deal.stage.changed',
  'message.received',
  'automation.executed',
  'lead.score.updated',
  'agent.assigned',
] as const satisfies readonly (keyof EventMap)[]

export async function GET(req: NextRequest) {
  // ─── Auth ─────────────────────────────────────────────────
  const cookieHeader = req.headers.get('cookie') ?? ''
  const cookieMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))
  const token = cookieMatch?.[1] ?? ''
  const session = token ? await verifySessionToken(token) : null
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') ?? session.workspaceId

  if (!workspaceId) {
    return new Response('workspaceId required', { status: 400 })
  }

  // Verify user belongs to this workspace
  if (session.workspaceId && session.workspaceId !== workspaceId) {
    return new Response('Forbidden', { status: 403 })
  }

  // ─── SSE stream setup ────────────────────────────────────
  const encoder = new TextEncoder()
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let closed = false
  const unsubscribers: Array<() => void> = []

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(payload))
        } catch {
          close()
        }
      }

      function close() {
        if (closed) return
        closed = true
        if (pingTimer) clearInterval(pingTimer)
        for (const unsub of unsubscribers) unsub()
        try { controller.close() } catch { /* already closed */ }
      }

      // ── Ping every 30s to keep connection alive ───────────
      pingTimer = setInterval(() => {
        send('ping', { ts: Date.now() })
      }, 30_000)

      // ── Subscribe to workspace-scoped events ──────────────
      for (const evt of DASHBOARD_EVENTS) {
        const unsub = subscribe(evt, (data) => {
          // Only forward events that belong to this workspace
          const eventData = data as unknown as Record<string, unknown>
          if (eventData?.workspaceId && eventData.workspaceId !== workspaceId) return
          send(evt, data)
        })
        unsubscribers.push(unsub)
      }

      // ── Send initial connected event ──────────────────────
      send('connected', { workspaceId, ts: Date.now() })

      // ── Cleanup on client disconnect ──────────────────────
      req.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection:      'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

