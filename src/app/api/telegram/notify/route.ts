// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Notification Endpoint
// POST /api/telegram/notify — Send a notification to Telegram
//
// This endpoint can be called from any part of the system
// (automations, cron jobs, engine events) to push notifications
// to the workspace's Telegram bot.
//
// Supports all 10 notification types:
//   new_message, lead_temperature_spike, deal_stage_change,
//   ghosting_detected, followup_due, automation_triggered,
//   error_alert, daily_summary, weekly_report, nexus_emotional_alert
//
// Requires authentication via session cookie.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import {
  sendNotification,
  sendDailySummary,
  sendWeeklyReport,
  type TelegramNotificationType,
} from '@/lib/telegram-control'

// Valid notification types
const VALID_TYPES: TelegramNotificationType[] = [
  'new_message',
  'lead_temperature_spike',
  'deal_stage_change',
  'ghosting_detected',
  'followup_due',
  'automation_triggered',
  'error_alert',
  'daily_summary',
  'weekly_report',
  'nexus_emotional_alert',
]

interface NotifyRequestBody {
  workspaceId: string
  type: TelegramNotificationType | 'daily_summary' | 'weekly_report'
  title?: string
  body?: string
  contactName?: string
  metadata?: Record<string, unknown>
}

/**
 * POST /api/telegram/notify
 *
 * Send a notification to Telegram.
 *
 * Body examples:
 *   // Simple notification
 *   { workspaceId: "xxx", type: "new_message", body: "Juan sent a message", contactName: "Juan" }
 *
 *   // Error alert (bypasses pause)
 *   { workspaceId: "xxx", type: "error_alert", title: "API Down", body: "WhatsApp connection lost" }
 *
 *   // Daily summary (auto-generates from DB data)
 *   { workspaceId: "xxx", type: "daily_summary" }
 *
 *   // Weekly report (auto-generates from DB data)
 *   { workspaceId: "xxx", type: "weekly_report" }
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const session = await requireAuth(req)

    const body: NotifyRequestBody = await req.json()
    const { workspaceId, type, title, body: messageBody, contactName, metadata } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      )
    }

    if (!type || !VALID_TYPES.includes(type as TelegramNotificationType)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    let result: { success: boolean; error?: string }

    // Special auto-generated reports
    if (type === 'daily_summary') {
      result = await sendDailySummary(workspaceId)
    } else if (type === 'weekly_report') {
      result = await sendWeeklyReport(workspaceId)
    } else {
      // Regular notification
      if (!messageBody) {
        return NextResponse.json(
          { error: 'body is required for this notification type' },
          { status: 400 }
        )
      }

      result = await sendNotification({
        type: type as TelegramNotificationType,
        workspaceId,
        title: title || type,
        body: messageBody,
        contactName,
        metadata,
      })
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 200 } // Return 200 but with error details — the notification failed but the request was valid
      )
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent: ${type}`,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to send Telegram notification')
  }
}

/**
 * GET /api/telegram/notify
 * Health check for the notification endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'ValiAutoFlow Telegram Notifications',
    availableTypes: VALID_TYPES,
    timestamp: new Date().toISOString(),
  })
}
