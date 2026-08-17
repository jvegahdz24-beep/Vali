// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Unpair Endpoint
// Route: POST /api/telegram/unpair
//
// Clears the current user's Telegram binding and invalidates the pairing token.
// This prevents a previously issued token from silently re-linking the account.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)

    const updated = await db.user.update({
      where: { id: session.userId },
      data: {
        telegramChatId: null,
        telegramLinkToken: null,
        telegramLinkTokenExpires: null,
      },
    })

    return NextResponse.json({
      ok: true,
      paired: false,
      message: 'Cuenta de Telegram desvinculada',
    })
  } catch (error) {
    return errorResponse(error, 'Error al desvincular Telegram')
  }
}
