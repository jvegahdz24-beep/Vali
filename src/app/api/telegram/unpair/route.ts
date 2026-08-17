// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Unpair Endpoint
// Route: POST /api/telegram/unpair
//
// Clears the current user's `telegramChatId` so they stop receiving
// notifications. Useful when the user wants to disconnect Telegram
// without losing their ValiAutoFlow account.
//
// We deliberately clear the chatId but keep the link token's expiry —
// the user can re-pair with the same token if it hasn't expired yet.
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
        // Keep telegramLinkToken + telegramLinkTokenExpires so the user
        // can re-pair quickly. They will be cleared on successful pair
        // in the webhook handler.
      },
      select: { telegramChatId: true },
    })

    return NextResponse.json({
      ok: true,
      paired: !!updated.telegramChatId,
      message: updated.telegramChatId
        ? 'No se pudo desvincular completamente'
        : 'Cuenta de Telegram desvinculada',
    })
  } catch (error) {
    return errorResponse(error, 'Error al desvincular Telegram')
  }
}
