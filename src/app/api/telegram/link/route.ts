// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Link Token Generator
// Route: POST /api/telegram/link
//
// Generates a one-time deep-link so the user can pair their Telegram
// account with their ValiAutoFlow user. The flow is:
//
//   1. UI calls POST /api/telegram/link  → returns { url, token, expiresAt }
//   2. UI shows the URL as `https://t.me/<bot>?start=<token>` or a
//      button that opens it.
//   3. The user taps the link, Telegram opens a chat with the bot and
//      sends `/start <token>`.
//   4. /api/telegram/webhook receives the message, looks up the token
//      (stored on the User.telegramLinkToken column) and binds the
//      Telegram chatId to the user (User.telegramChatId).
//
// We persist the link token on the User row so that a fresh session
// from any device still finds the original pairing intent. The webhook
// also supports a fallback: if `linkToken` matches an active session
// token, the user is paired that way (legacy).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/api-auth'

const LINK_TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    // Light rate limit — pairing tokens shouldn't be generated more than
    // a few times per minute per IP.
    const ip = getClientIp(req)
    const rl = rateLimit(`${ip}:telegram:link`, 5, 60_000)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Espera un momento.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { workspaceId } = body as { workspaceId?: string }

    // Optional: verify the user belongs to the workspace they claim.
    // If no workspaceId is provided, we just pair against the user.
    if (workspaceId) {
      const member = await db.workspaceMember.findFirst({
        where: { workspaceId, userId: session.userId },
      })
      if (!member) {
        return NextResponse.json({ error: 'No perteneces a este workspace' }, { status: 403 })
      }
    }

    // Generate a random token. 32 bytes (256 bits) of entropy — far more
    // than enough to make guessing infeasible.
    const token = randomBytes(32).toString('hex')

    // Persist on the user with a TTL stored as ISO string in metadata.
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS)
    await db.user.update({
      where: { id: session.userId },
      data: {
        telegramLinkToken: token,
        telegramLinkTokenExpires: expiresAt,
      },
    })

    // Build the deep link. The bot username is configurable per workspace
    // via wsSettings.telegramBotUsername, with a global env-var fallback.
    let botUsername: string | undefined
    if (workspaceId) {
      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { settings: true },
      })
      if (workspace) {
        try {
          const settings = JSON.parse(workspace.settings || '{}') as Record<string, unknown>
          botUsername = settings.telegramBotUsername as string | undefined
        } catch { /* ignore */ }
      }
    }
    botUsername = botUsername || process.env.TELEGRAM_BOT_USERNAME

    const startParam = encodeURIComponent(token)
    const url = botUsername
      ? `https://t.me/${botUsername}?start=${startParam}`
      : null

    return NextResponse.json({
      ok: true,
      token,
      url,
      expiresAt: expiresAt.toISOString(),
      instructions: botUsername
        ? `Abre ${url} en tu teléfono o haz clic. Telegram abrirá un chat con el bot; al enviarse /start tu cuenta quedará vinculada.`
        : `Configura TELEGRAM_BOT_USERNAME (o el ajuste telegramBotUsername del workspace) para generar el enlace directo. Mientras tanto, manda /start ${token} a tu bot desde Telegram.`,
    })
  } catch (error) {
    return errorResponse(error, 'Error al generar enlace de Telegram')
  }
}

/**
 * GET /api/telegram/link
 * Returns the current link state for the caller (paired? token valid?).
 * Useful for the UI to know whether to show "Vincular" or "Vinculado".
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        telegramChatId: true,
        telegramLinkToken: true,
        telegramLinkTokenExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const now = new Date()
    const hasValidToken =
      !!user.telegramLinkToken &&
      !!user.telegramLinkTokenExpires &&
      user.telegramLinkTokenExpires > now

    return NextResponse.json({
      paired: !!user.telegramChatId,
      pendingToken: hasValidToken ? user.telegramLinkToken : null,
      pendingTokenExpiresAt: hasValidToken
        ? user.telegramLinkTokenExpires?.toISOString()
        : null,
    })
  } catch (error) {
    return errorResponse(error, 'Error al consultar estado de Telegram')
  }
}
