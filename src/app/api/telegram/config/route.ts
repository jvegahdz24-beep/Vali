// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Bot Credentials (per-workspace)
// Route: /api/telegram/config
//
// Each workspace (tenant) brings its OWN Telegram bot, created via
// @BotFather. This route lets an owner/admin save that bot's token and
// username into the workspace settings JSON, where the rest of the
// Telegram flow (link / setup / webhook) already reads them from:
//
//   wsSettings.telegramBotToken     — the BotFather token (secret)
//   wsSettings.telegramBotUsername  — the bot @username (sin @)
//   wsSettings.telegramWebhookSecret — opcional, valida el webhook
//
//   GET  → returns whether a bot is configured (token masked) + username
//   POST → saves the credentials (owner/admin only)
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { db } from '@/lib/db'

/** Mask a secret so we can show "configured" state without leaking it. */
function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••'
  return `${token.slice(0, 4)}••••${token.slice(-4)}`
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

    const botToken = wsSettings.telegramBotToken as string | undefined
    const botUsername = wsSettings.telegramBotUsername as string | undefined

    return NextResponse.json({
      hasToken: !!botToken,
      tokenMasked: botToken ? maskToken(botToken) : null,
      botUsername: botUsername || null,
      hasWebhookSecret: !!wsSettings.telegramWebhookSecret,
    })
  } catch (error) {
    return errorResponse(error, 'Error al consultar la configuración de Telegram')
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    const body = await req.json().catch(() => ({}))
    const { workspaceId, botToken, botUsername, webhookSecret } = body as {
      workspaceId?: string
      botToken?: string
      botUsername?: string
      webhookSecret?: string
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    // ── Only owner/admin may set the bot credentials ──
    const member = await requireWorkspace(workspaceId, session.userId)
    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Solo el dueño o un administrador puede configurar el bot' }, { status: 403 })
    }

    // ── Normalize inputs ──
    const cleanToken = botToken?.trim()
    // Username: strip a leading @ and any whitespace; Telegram usernames
    // are case-insensitive and never contain spaces.
    const cleanUsername = botUsername?.trim().replace(/^@/, '')
    const cleanSecret = webhookSecret?.trim()

    // ── Validate token shape when provided (123456789:AA...) ──
    if (cleanToken && !/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(cleanToken)) {
      return NextResponse.json(
        { error: 'El token no parece válido. Debe verse como 123456789:AAExxxxxxxx (lo da @BotFather).' },
        { status: 422 }
      )
    }
    if (cleanUsername && !/^[A-Za-z0-9_]{3,}$/.test(cleanUsername)) {
      return NextResponse.json(
        { error: 'El nombre de usuario del bot solo puede contener letras, números y guion bajo (sin @).' },
        { status: 422 }
      )
    }

    // ── Verify the token against Telegram before saving (getMe) ──
    // This catches typos/revoked tokens immediately so the user isn't
    // left wondering why pairing fails later.
    let verifiedUsername: string | undefined
    if (cleanToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`)
        const data = await res.json() as {
          ok: boolean
          result?: { username?: string }
          description?: string
        }
        if (!data.ok) {
          return NextResponse.json(
            { error: `Telegram rechazó el token: ${data.description || 'token inválido'}. Verifícalo con @BotFather.` },
            { status: 422 }
          )
        }
        verifiedUsername = data.result?.username
        // Registrar el MENÚ de comandos del bot (aparece con el botón "Menú")
        await fetch(`https://api.telegram.org/bot${cleanToken}/setMyCommands`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commands: [
            { command: 'start', description: 'Iniciar bot y vincular cuenta' },
            { command: 'pendientes', description: 'Ver aprobaciones pendientes' },
            { command: 'aprobar', description: 'Aprobar solicitud por ID' },
            { command: 'rechazar', description: 'Rechazar solicitud por ID' },
            { command: 'estado', description: 'Estado del sistema' },
          ] }),
        }).catch(() => {})
      } catch {
        return NextResponse.json(
          { error: 'No se pudo contactar a Telegram para verificar el token. Inténtalo de nuevo.' },
          { status: 502 }
        )
      }
    }

    // ── Merge into the existing settings JSON ──
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    let wsSettings: Record<string, unknown> = {}
    try { wsSettings = JSON.parse(workspace.settings || '{}') } catch { /* ignore */ }

    if (cleanToken) wsSettings.telegramBotToken = cleanToken
    // Prefer the username Telegram itself reports (authoritative); fall back
    // to whatever the user typed.
    const finalUsername = verifiedUsername || cleanUsername
    if (finalUsername) wsSettings.telegramBotUsername = finalUsername
    if (cleanSecret !== undefined) {
      if (cleanSecret) wsSettings.telegramWebhookSecret = cleanSecret
      else delete wsSettings.telegramWebhookSecret
    }

    await db.workspace.update({
      where: { id: workspaceId },
      data: { settings: JSON.stringify(wsSettings) },
    })

    return NextResponse.json({
      ok: true,
      botUsername: finalUsername || null,
      hasToken: !!wsSettings.telegramBotToken,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return errorResponse(error, 'Error al guardar la configuración de Telegram')
  }
}
