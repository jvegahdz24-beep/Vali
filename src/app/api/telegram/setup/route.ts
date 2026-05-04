// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Bot Setup Endpoint
// POST /api/telegram/setup — Register a Telegram bot for a workspace
// GET /api/telegram/setup — Get current bot status
// DELETE /api/telegram/setup — Disconnect the bot
//
// Requires authentication via session cookie.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { setupTelegramBot, disconnectTelegramBot, getTelegramBotStatus } from '@/lib/telegram-control'

/**
 * POST /api/telegram/setup
 *
 * Register a Telegram bot for the workspace.
 * Body: { workspaceId, botToken }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, botToken } = body

    if (!workspaceId || !botToken) {
      return NextResponse.json(
        { error: 'workspaceId and botToken are required' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    // Build webhook URL from the request
    const protocol = req.headers.get('x-forwarded-proto') || 'https'
    const host = req.headers.get('host') || 'localhost:3000'
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook?bot_token=${encodeURIComponent(botToken)}`

    const result = await setupTelegramBot(workspaceId, botToken, webhookUrl)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Telegram bot registered successfully',
      bot: result.botInfo,
      webhookUrl,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to setup Telegram bot')
  }
}

/**
 * GET /api/telegram/setup?workspaceId=xxx
 *
 * Get the current Telegram bot status for a workspace.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId query param is required' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    const status = await getTelegramBotStatus(workspaceId)

    return NextResponse.json({
      success: true,
      ...status,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to get Telegram bot status')
  }
}

/**
 * DELETE /api/telegram/setup?workspaceId=xxx
 *
 * Disconnect/remove the Telegram bot for a workspace.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId query param is required' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    const result = await disconnectTelegramBot(workspaceId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Telegram bot disconnected',
    })
  } catch (error) {
    return errorResponse(error, 'Failed to disconnect Telegram bot')
  }
}
