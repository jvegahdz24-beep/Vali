// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Webhook Setup
// Route: POST /api/telegram/setup
//
// Registers (or removes) the Telegram Bot webhook with Telegram's
// servers. The webhook is used only for account pairing via /start;
// Telegram is an internal notification channel, not a customer chat.
//
// Usage:
//   POST /api/telegram/setup
//   Body: { workspaceId: string, action?: "set" | "delete" }
//
// The bot token must be configured in workspace settings:
//   wsSettings.telegramBotToken  — workspace-specific bot token
// Or in env: TELEGRAM_BOT_TOKEN (fallback)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    const body = await req.json()
    const { workspaceId, action = 'set' } = body as {
      workspaceId?: string
      action?: 'set' | 'delete'
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    // ── Verify caller is owner/admin of the workspace ──
    const member = await requireWorkspace(workspaceId, session.userId)
    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Forbidden — owner or admin required' }, { status: 403 })
    }

    // ── Load workspace settings ──
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    let wsSettings: Record<string, unknown> = {}
    try {
      wsSettings = JSON.parse(workspace.settings || '{}')
    } catch { /* ignore */ }

    const botToken = (wsSettings.telegramBotToken as string | undefined)
      || process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      return NextResponse.json(
        { error: 'telegramBotToken not configured. Add it to workspace settings or TELEGRAM_BOT_TOKEN env var.' },
        { status: 422 }
      )
    }

    if (action === 'delete') {
      // ── Remove webhook ──
      const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
        method: 'POST',
      })
      const data = await res.json()
      return NextResponse.json({ ok: true, action: 'deleted', telegram: data })
    }

    // ── Set webhook ──
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL
    if (!baseUrl) {
      return NextResponse.json(
        { error: 'NEXTAUTH_URL or NEXT_PUBLIC_APP_URL env var is required to build the webhook URL.' },
        { status: 422 }
      )
    }

    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook/${workspaceId}`

    const webhookSecret = (wsSettings.telegramWebhookSecret as string | undefined)
      || process.env.TELEGRAM_WEBHOOK_SECRET

    const payload: Record<string, unknown> = { url: webhookUrl }
    if (webhookSecret) payload.secret_token = webhookSecret

    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (!data.ok) {
      return NextResponse.json(
        { error: 'Telegram API error', details: data },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      webhookUrl,
      telegram: data,
    })
  } catch (error) {
    console.error('[Telegram setup]', error)
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    const workspaceId = req.nextUrl.searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query param required' }, { status: 400 })
    }

    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    let wsSettings: Record<string, unknown> = {}
    try { wsSettings = JSON.parse(workspace.settings || '{}') } catch { /* ignore */ }

    const botToken = (wsSettings.telegramBotToken as string | undefined)
      || process.env.TELEGRAM_BOT_TOKEN

    if (!botToken) {
      return NextResponse.json({ configured: false, message: 'No bot token configured' })
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
    const data = await res.json()

    return NextResponse.json({ configured: true, webhook: data.result })
  } catch (error) {
    console.error('[Telegram setup GET]', error)
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
