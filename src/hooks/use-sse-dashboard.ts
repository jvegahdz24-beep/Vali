// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Hook: Real-Time Dashboard SSE
// Subscribes to /api/sse/dashboard and exposes the latest events
// via a stable callback interface. Auto-reconnects on error.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useCallback } from 'react'

export type SSEDashboardEvent =
  | 'deal.stage_changed'
  | 'message.received'
  | 'automation.triggered'
  | 'connected'
  | 'ping'

export interface SSEDashboardOptions {
  workspaceId: string
  /** Called when any SSE event arrives */
  onEvent?: (event: SSEDashboardEvent, data: unknown) => void
  /** Called when connected/reconnected */
  onConnect?: () => void
  /** Called when connection is lost (before retry) */
  onDisconnect?: () => void
  /** Disable the hook */
  disabled?: boolean
}

const RECONNECT_DELAY_MS = 3_000
const MAX_RECONNECT_DELAY_MS = 30_000

/**
 * Subscribe to the real-time SSE dashboard stream.
 * Events are forwarded to `onEvent`. Reconnects automatically.
 */
export function useSSEDashboard({
  workspaceId,
  onEvent,
  onConnect,
  onDisconnect,
  disabled = false,
}: SSEDashboardOptions): void {
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(RECONNECT_DELAY_MS)
  const mountedRef = useRef(true)
  const connectRef = useRef<() => void>(() => {})

  const onEventRef = useRef(onEvent)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)

  const connect = useCallback(() => {
    if (!mountedRef.current || disabled || !workspaceId) return

    const url = `/api/sse/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`
    const es = new EventSource(url)
    esRef.current = es

    const events: SSEDashboardEvent[] = [
      'deal.stage_changed',
      'message.received',
      'automation.triggered',
      'connected',
      'ping',
    ]

    for (const evt of events) {
      es.addEventListener(evt, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          onEventRef.current?.(evt, data)
          if (evt === 'connected') {
            reconnectDelay.current = RECONNECT_DELAY_MS
            onConnectRef.current?.()
          }
        } catch {
          // ignore parse errors
        }
      })
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      if (!mountedRef.current) return
      onDisconnectRef.current?.()

      // Exponential backoff capped at 30s
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current()
      }, reconnectDelay.current)

      reconnectDelay.current = Math.min(
        reconnectDelay.current * 2,
        MAX_RECONNECT_DELAY_MS
      )
    }
  }, [workspaceId, disabled])

  useEffect(() => {
    onEventRef.current = onEvent
    onConnectRef.current = onConnect
    onDisconnectRef.current = onDisconnect
    connectRef.current = connect
  }, [onEvent, onConnect, onDisconnect, connect])

  useEffect(() => {
    mountedRef.current = true
    if (!disabled && workspaceId) {
      connect()
    }
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [connect, disabled, workspaceId])
}
