// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Notification Center (Section 15)
// Sends alerts via Telegram bot to users who have linked their chat
// ═══════════════════════════════════════════════════════════════

const TELEGRAM_API = 'https://api.telegram.org/bot'

/**
 * Send a Telegram message to a specific chat ID.
 * Requires TELEGRAM_BOT_TOKEN env var.
 */
export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
}

export async function sendTelegramNotification(
  chatId: string,
  message: string,
  parseMode: 'HTML' | 'Markdown' | 'MarkdownV2' = 'HTML',
  botToken?: string,
  replyMarkup?: InlineKeyboard
): Promise<{ ok: boolean; error?: string }> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }
  }
  if (!chatId) {
    return { ok: false, error: 'No chatId provided' }
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    })
    const data = await res.json() as { ok: boolean; description?: string }
    if (!data.ok) {
      return { ok: false, error: data.description ?? 'Telegram API error' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Envía una FOTO con pie de foto a un chat de Telegram (canal, grupo o lead).
 * Se usa como canal de PUBLICACIÓN de marketing (contrato A.2.7 §1c).
 */
export async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption?: string,
  botToken?: string,
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }
  if (!chatId) return { ok: false, error: 'No chatId provided' }
  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Sin parse_mode: el caption de marketing es texto plano (evita errores
      // 400 de Telegram por caracteres especiales en HTML/Markdown).
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: (caption || '').slice(0, 1024) }),
    })
    const data = await res.json() as { ok: boolean; description?: string; result?: { message_id?: number } }
    if (!data.ok) return { ok: false, error: data.description ?? 'Telegram API error' }
    return { ok: true, messageId: data.result?.message_id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/** Config de Telegram del workspace: token del bot + chat del canal/grupo de marketing. */
export async function getWorkspaceTelegramConfig(workspaceId: string): Promise<{ botToken?: string; channelChatId?: string }> {
  const { db } = await import('@/lib/db')
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  let s: Record<string, unknown> = {}
  try { s = JSON.parse(ws?.settings || '{}') } catch { /* */ }
  const marketing = (s.marketing as Record<string, unknown> | undefined) || {}
  const tg = (marketing.telegram as Record<string, unknown> | undefined) || {}
  const botToken = (s.telegramBotToken as string | undefined) || process.env.TELEGRAM_BOT_TOKEN
  const channelChatId = (tg.channelChatId as string | undefined) || (s.telegramChannelChatId as string | undefined)
  return { botToken, channelChatId }
}

/**
 * Publica contenido de marketing en el canal/grupo de Telegram del tenant.
 * Si hay imagen la manda como foto+caption; si no, como mensaje. Vía Bot API,
 * sin aprobaciones externas (contrato A.2.7 §1c).
 */
export async function telegramPublishToChannel(
  workspaceId: string,
  content: { text?: string; imageUrl?: string },
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const { botToken, channelChatId } = await getWorkspaceTelegramConfig(workspaceId)
  if (!botToken) return { ok: false, error: 'Telegram no está conectado (falta el token del bot en Configuración)' }
  if (!channelChatId) return { ok: false, error: 'Falta el canal/grupo de Telegram en Marketing → Configuración' }
  if (content.imageUrl) return sendTelegramPhoto(channelChatId, content.imageUrl, content.text, botToken)
  if (content.text) { const r = await sendTelegramNotification(channelChatId, content.text, 'HTML', botToken); return { ok: r.ok, error: r.error } }
  return { ok: false, error: 'Sin contenido para publicar' }
}

/**
 * Broadcast a notification to all workspace users who have a telegramChatId.
 */
export async function broadcastToWorkspace(
  workspaceId: string,
  message: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  const { db } = await import('@/lib/db')

  // Resolve the per-workspace bot token (falls back to the global env var).
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { settings: true },
  })
  let botToken: string | undefined
  try {
    const settings = JSON.parse(workspace?.settings || '{}') as Record<string, unknown>
    botToken = (settings.telegramBotToken as string | undefined) || undefined
  } catch { /* ignore */ }
  botToken = botToken || process.env.TELEGRAM_BOT_TOKEN

  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { telegramChatId: true } } },
  })

  await Promise.allSettled(
    members
      .filter(m => m.user.telegramChatId)
      .map(m => sendTelegramNotification(m.user.telegramChatId!, message, 'HTML', botToken, replyMarkup))
  )
}
