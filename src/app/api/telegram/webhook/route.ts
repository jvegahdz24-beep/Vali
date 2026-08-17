// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Webhook (Section 15)
// Receives Telegram updates and saves chatId when user sends /start
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name?: string; username?: string }
    chat: { id: number; type: string }
    text?: string
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret to prevent spoofed requests
    const secret = req.headers.get('x-telegram-bot-api-secret-token')
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET
    if (expected && secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const update: TelegramUpdate = await req.json()
    const message = update.message
    if (!message?.text || !message.from) {
      return NextResponse.json({ ok: true })
    }

    const text = message.text.trim()
    const chatId = String(message.chat.id)

    // Handle /start [token] — link Telegram chat to user account
    if (text.startsWith('/start')) {
      const parts = text.split(' ')
      const linkToken = parts[1] // optional token to identify user

      if (linkToken) {
        // Find user by telegramLinkToken (stored in metadata or a dedicated column)
        // For now, find user whose email matches a stored token mapping
        const session = await db.session.findFirst({
          where: { sessionToken: linkToken },
          include: { user: true },
        })

        if (session?.user) {
          await db.user.update({
            where: { id: session.user.id },
            data: { telegramChatId: chatId },
          })

          // Send confirmation
          const token = process.env.TELEGRAM_BOT_TOKEN
          if (token) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `✅ Tu cuenta ValiAutoFlow ha sido vinculada correctamente. Recibirás notificaciones aquí.`,
              }),
            })
          }
        } else {
          // Token not found — just acknowledge
          const token = process.env.TELEGRAM_BOT_TOKEN
          if (token) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `⚠️ Token inválido o expirado. Genera un nuevo enlace desde la configuración de ValiAutoFlow.`,
              }),
            })
          }
        }
      } else {
        // Plain /start without token — inform about linking
        const token = process.env.TELEGRAM_BOT_TOKEN
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `👋 Bienvenido a ValiAutoFlow. Para vincular tu cuenta, ve a Ajustes → Notificaciones y usa el enlace de Telegram.`,
            }),
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Telegram webhook]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
