// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Webhook Endpoint
// POST /api/telegram/webhook — Receives updates from Telegram
//
// Telegram sends bot updates here. We parse the update, identify
// which workspace bot it belongs to, and process the command.
//
// SECURITY: Telegram webhook secret token verification
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  handleTelegramWebhook,
  verifyTelegramWebhook,
  type TelegramUpdate,
} from '@/lib/telegram-control'

/**
 * POST /api/telegram/webhook
 *
 * Telegram Bot API sends updates here when a message is sent
 * to any registered bot. The bot token is extracted from the
 * URL path or query parameter to identify the workspace.
 */
export async function POST(req: NextRequest) {
  try {
    // ─── Security: Verify webhook secret ──────────────────────
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token')
    const envSecret = process.env.TELEGRAM_WEBHOOK_SECRET

    if (envSecret && secretHeader !== envSecret) {
      return NextResponse.json(
        { error: 'Invalid webhook secret' },
        { status: 403 }
      )
    }

    // ─── Parse update ─────────────────────────────────────────
    const body: TelegramUpdate = await req.json()

    if (!body.update_id) {
      return NextResponse.json(
        { error: 'Invalid update format' },
        { status: 400 }
      )
    }

    // ─── Identify bot ─────────────────────────────────────────
    // The bot token can be passed via query param (for flexibility)
    // or we can look it up from the message context
    const botTokenFromQuery = req.nextUrl.searchParams.get('bot_token')

    if (!botTokenFromQuery) {
      // Try to find bot by checking all active bots
      // Telegram doesn't send the bot token in the update payload,
      // so we need another strategy. We iterate through active bots.
      // For production, each bot should have a unique webhook URL.
      console.warn('[Telegram Webhook] No bot_token query param — trying all active bots')

      const activeBots = await db.telegramBot.findMany({
        where: { isActive: true, chatId: { not: null } },
        select: { botToken: true, chatId: true, workspaceId: true },
      })

      if (activeBots.length === 0) {
        return NextResponse.json({ ok: true, processed: false, reason: 'no_active_bots' })
      }

      // Try each bot — only the correct one will have the right update_id pattern
      // In practice, each bot should have its own webhook URL with bot_token param
      // This is a fallback for single-bot setups
      if (activeBots.length === 1) {
        const result = await handleTelegramWebhook(body, activeBots[0].botToken)
        return NextResponse.json({ ok: true, ...result })
      }

      return NextResponse.json(
        { error: 'Multiple bots active — specify bot_token query param' },
        { status: 400 }
      )
    }

    // ─── Verify bot exists ────────────────────────────────────
    const bot = await db.telegramBot.findFirst({
      where: { botToken: botTokenFromQuery },
      select: { id: true, isActive: true },
    })

    if (!bot || !bot.isActive) {
      return NextResponse.json(
        { error: 'Bot not found or inactive' },
        { status: 404 }
      )
    }

    // ─── Process the update ───────────────────────────────────
    const result = await handleTelegramWebhook(body, botTokenFromQuery)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error('[Telegram Webhook Error]', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/telegram/webhook
 * Health check — Telegram uses this to verify the webhook endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'ValiAutoFlow Telegram Webhook',
    timestamp: new Date().toISOString(),
  })
}
