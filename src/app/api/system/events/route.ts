// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — System Events API
// GET  → event bus stats (registered listeners, recent events, DLQ)
// POST → replay events from a given timestamp
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { eventBus } from '@/lib/event-bus'
import {
  getRegisteredListenerCount,
  registerEventSubscribers,
} from '@/lib/event-bus-subscribers'
import type { EventType } from '@/lib/event-bus'

// ─── GET: Event Bus Stats ───────────────────────────────────

export async function GET() {
  try {
    // Ensure subscribers are registered
    registerEventSubscribers()

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Query recent event counts from EventLog
    const [
      totalEvents,
      recentHourEvents,
      recentDayEvents,
      unprocessedEvents,
      failedEvents,
      dlqSize,
      eventsByType,
    ] = await Promise.all([
      // Total events
      db.eventLog.count(),

      // Events in the last hour
      db.eventLog.count({
        where: { createdAt: { gte: oneHourAgo } },
      }),

      // Events in the last 24 hours
      db.eventLog.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),

      // Unprocessed events
      db.eventLog.count({
        where: { processed: false },
      }),

      // Failed events (unprocessed with error)
      db.eventLog.count({
        where: { processed: false, error: { not: null } },
      }),

      // DLQ size from in-memory
      Promise.resolve(eventBus.getDLQSize()),

      // Events grouped by type (top 10 types in last 24h)
      db.eventLog.groupBy({
        by: ['type'],
        where: { createdAt: { gte: twentyFourHoursAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        listeners: {
          registeredCount: getRegisteredListenerCount(),
        },
        events: {
          total: totalEvents,
          lastHour: recentHourEvents,
          last24Hours: recentDayEvents,
          unprocessed: unprocessedEvents,
          failed: failedEvents,
        },
        dlq: {
          size: dlqSize,
          entries: eventBus.getDLQ().slice(0, 5).map((entry) => ({
            eventId: entry.event.id,
            eventType: entry.event.type,
            error: entry.error,
            handlerName: entry.handlerName,
            retryCount: entry.retryCount,
            nextRetryAt: entry.nextRetryAt,
          })),
        },
        topEventTypes: eventsByType.map((group) => ({
          type: group.type,
          count: group._count.id,
        })),
        timestamp: now.toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch event bus stats', details: message },
      { status: 500 },
    )
  }
}

// ─── POST: Replay Events ───────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, timestamp, eventTypes, limit } = body as {
      action?: string
      timestamp?: string
      eventTypes?: string[]
      limit?: number
    }

    // Only supported action: replay
    if (action !== 'replay') {
      return NextResponse.json(
        { success: false, error: `Unsupported action: "${action}". Use "replay".` },
        { status: 400 },
      )
    }

    // Validate timestamp
    if (!timestamp) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: "timestamp" (ISO 8601 string).' },
        { status: 400 },
      )
    }

    const startTime = new Date(timestamp)
    if (isNaN(startTime.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid timestamp format. Use ISO 8601 (e.g., 2025-01-01T00:00:00Z).' },
        { status: 400 },
      )
    }

    // Ensure subscribers are registered before replay
    registerEventSubscribers()

    const replayLimit = typeof limit === 'number' && limit > 0 && limit <= 500 ? limit : 100

    const replayed = await eventBus.replayEvents(
      startTime,
      eventTypes as EventType[] | undefined,
      replayLimit,
    )

    return NextResponse.json({
      success: true,
      data: {
        replayed,
        from: startTime.toISOString(),
        eventTypes: eventTypes || 'all',
        limit: replayLimit,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { success: false, error: 'Failed to replay events', details: message },
      { status: 500 },
    )
  }
}
