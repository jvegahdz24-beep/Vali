// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Telegram Bot Control Center
// Full Telegram Bot integration via HTTP calls to Telegram Bot API
// 14 Commands + 10 Notification Types + Webhook Handler
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { chatWithAI } from '@/lib/ai/providers'
import { formatCurrency, formatNumber, timeAgo } from '@/lib/utils'
import crypto from 'crypto'

// ─── Telegram API Types ──────────────────────────────────────

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
  date: number
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data: string
}

// ─── Notification Types ──────────────────────────────────────

export type TelegramNotificationType =
  | 'new_message'
  | 'lead_temperature_spike'
  | 'deal_stage_change'
  | 'ghosting_detected'
  | 'followup_due'
  | 'automation_triggered'
  | 'error_alert'
  | 'daily_summary'
  | 'weekly_report'
  | 'nexus_emotional_alert'

export interface TelegramNotificationPayload {
  type: TelegramNotificationType
  workspaceId: string
  title: string
  body: string
  contactName?: string
  metadata?: Record<string, unknown>
}

// ─── Telegram Bot API Wrapper ────────────────────────────────

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

async function telegramApiCall(
  botToken: string,
  method: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const url = `${TELEGRAM_API_BASE}${botToken}/${method}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Telegram API ${method} failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    disable_web_page_preview?: boolean
  }
): Promise<{ success: boolean; message_id?: number; error?: string }> {
  try {
    const result = await telegramApiCall(botToken, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
    }) as any
    return {
      success: true,
      message_id: result?.result?.message_id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram] sendTelegramMessage failed:', msg)
    return { success: false, error: msg }
  }
}

// ─── Webhook Management ──────────────────────────────────────

export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken?: string
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }
    if (secretToken) {
      payload.secret_token = secretToken
    }
    await telegramApiCall(botToken, 'setWebhook', payload)
    return true
  } catch (err) {
    console.error('[Telegram] setWebhook failed:', err)
    return false
  }
}

export async function deleteTelegramWebhook(botToken: string): Promise<boolean> {
  try {
    await telegramApiCall(botToken, 'deleteWebhook', { drop_pending_updates: true })
    return true
  } catch (err) {
    console.error('[Telegram] deleteWebhook failed:', err)
    return false
  }
}

export async function getTelegramBotInfo(
  botToken: string
): Promise<{ id: number; username?: string; first_name: string } | null> {
  try {
    const result = await telegramApiCall(botToken, 'getMe', {}) as any
    return result?.result || null
  } catch (err) {
    console.error('[Telegram] getMe failed:', err)
    return null
  }
}

// ─── Webhook Signature Verification ──────────────────────────

export function verifyTelegramWebhook(
  body: string,
  secretToken: string
): boolean {
  const headerToken = process.env.TELEGRAM_WEBHOOK_SECRET || secretToken
  if (!headerToken) return false
  // Telegram sends the secret in X-Telegram-Bot-Api-Secret-Token header
  // The route handler passes it here after extracting
  // Simple timing-safe comparison
  const a = Buffer.from(headerToken)
  const b = Buffer.from(secretToken)
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) { result |= a[i] ^ b[i] }
  return result === 0
}

// ─── Workspace Bot Lookup ───────────────────────────────────
// Telegram credentials are stored in Workspace/settings and the linked chat
// belongs to the workspace owner. There is intentionally no TelegramBot
// Prisma model in the current schema.
type TelegramWorkspaceBot = {
  id: string
  workspaceId: string
  botToken: string
  isActive: boolean
  chatId: string | null
  pausedAt: Date | null
  createdAt: Date
  workspace: { id: string; name: string }
}

function parseWorkspaceSettings(settings: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(settings || '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function findBotByWorkspace(workspaceId: string): Promise<TelegramWorkspaceBot | null> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, ownerId: true, telegramBotToken: true, settings: true, isActive: true, createdAt: true },
  })
  if (!workspace) return null

  const settings = parseWorkspaceSettings(workspace.settings)
  const botToken = workspace.telegramBotToken || (typeof settings.telegramBotToken === 'string' ? settings.telegramBotToken : '')
  if (!botToken) return null

  const owner = await db.user.findUnique({ where: { id: workspace.ownerId }, select: { telegramChatId: true } })
  const pausedAtValue = typeof settings.telegramPausedAt === 'string' ? new Date(settings.telegramPausedAt) : null
  const pausedAt = pausedAtValue && !Number.isNaN(pausedAtValue.getTime()) ? pausedAtValue : null

  return {
    id: workspace.id,
    workspaceId: workspace.id,
    botToken,
    isActive: workspace.isActive,
    chatId: owner?.telegramChatId || null,
    pausedAt,
    createdAt: workspace.createdAt,
    workspace: { id: workspace.id, name: workspace.name },
  }
}

/**
 * Token-only lookup is intentionally disabled. The supported webhook includes
 * the workspace id; accepting a token without tenant context would require a
 * global scan of secrets stored in settings.
 */
async function findBotByToken(_botToken: string, workspaceId?: string): Promise<TelegramWorkspaceBot | null> {
  if (!workspaceId) return null
  const bot = await findBotByWorkspace(workspaceId)
  return bot?.botToken === _botToken ? bot : null
}

async function setWorkspaceTelegramPaused(workspaceId: string, pausedAt: Date | null): Promise<void> {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
  if (!workspace) return
  const settings = parseWorkspaceSettings(workspace.settings)
  if (pausedAt) settings.telegramPausedAt = pausedAt.toISOString()
  else delete settings.telegramPausedAt
  await db.workspace.update({ where: { id: workspaceId }, data: { settings: JSON.stringify(settings) } })
}

// ─── Command Router ──────────────────────────────────────────

type CommandContext = {
  botToken: string
  chatId: string
  workspaceId: string
  workspaceName: string
  userName: string
  args: string
}

async function handleCommand(ctx: CommandContext): Promise<string> {
  const { args } = ctx
  const command = args.split(' ')[0]?.toLowerCase()?.replace('/', '') || ''

  switch (command) {
    case 'start':
      return cmdStart(ctx)
    case 'status':
      return cmdStatus(ctx)
    case 'leads':
      return cmdLeads(ctx)
    case 'deals':
      return cmdDeals(ctx)
    case 'inbox':
      return cmdInbox(ctx)
    case 'temperature':
      return cmdTemperature(ctx)
    case 'memory':
      return cmdMemory(ctx)
    case 'pause':
      return cmdPause(ctx)
    case 'resume':
      return cmdResume(ctx)
    case 'agents':
      return cmdAgents(ctx)
    case 'analytics':
      return cmdAnalytics(ctx)
    case 'followups':
      return cmdFollowups(ctx)
    case 'calendar':
      return cmdCalendar(ctx)
    case 'help':
      return cmdHelp(ctx)
    default:
      return cmdHelp(ctx)
  }
}

// ═══════════════════════════════════════════════════════════════
// 14 BOT COMMANDS — Each with REAL DB queries
// ═══════════════════════════════════════════════════════════════

async function cmdStart(ctx: CommandContext): Promise<string> {
  return `<b>🚀 ValiAutoFlow Telegram Control</b>

Welcome, <b>${escapeHtml(ctx.userName)}</b>!

You're connected to workspace: <b>${escapeHtml(ctx.workspaceName)}</b>

I'm your AI-powered CRM assistant. I can monitor leads, track deals, manage follow-ups, and keep you updated on everything happening in your sales pipeline.

Type <b>/help</b> to see all available commands.

<i>Powered by ValiAutoFlow</i>`
}

async function cmdStatus(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const [
    activeConversations,
    pendingMessages,
    openDeals,
    activeAgents,
    activeAutomations,
    pendingFollowups,
    totalContacts,
    isPaused,
  ] = await Promise.all([
    db.conversation.count({
      where: { workspaceId, status: 'active' },
    }),
    db.conversation.aggregate({
      where: { workspaceId, status: 'active' },
      _sum: { unreadCount: true },
    }),
    db.deal.count({
      where: { workspaceId, status: 'active' },
    }),
    db.agent.count({
      where: { workspaceId, isActive: true },
    }),
    db.automation.count({
      where: { workspaceId, isActive: true },
    }),
    db.followUpTask.count({
      where: { workspaceId, status: 'pending' },
    }),
    db.contact.count({
      where: { workspaceId, status: 'active' },
    }),
    findBotByWorkspace(workspaceId),
  ])

  const pipelineValue = await db.deal.aggregate({
    where: { workspaceId, status: 'active' },
    _sum: { value: true },
  })

  const statusIcon = isPaused?.pausedAt ? '⏸️' : '🟢'
  const statusText = isPaused?.pausedAt
    ? `Paused since ${timeAgo(new Date(isPaused.pausedAt))}`
    : 'All systems operational'

  return `<b>📊 System Status — ${escapeHtml(ctx.workspaceName)}</b>

${statusIcon} Status: <b>${statusText}</b>

<b>📈 Overview:</b>
  Contacts: <b>${formatNumber(totalContacts)}</b>
  Active Conversations: <b>${activeConversations}</b>
  Unread Messages: <b>${pendingMessages._sum.unreadCount || 0}</b>

<b>💰 Pipeline:</b>
  Open Deals: <b>${openDeals}</b>
  Pipeline Value: <b>${formatCurrency(pipelineValue._sum.value || 0)}</b>

<b>🤖 Automations:</b>
  Active Agents: <b>${activeAgents}</b>
  Active Automations: <b>${activeAutomations}</b>
  Pending Follow-ups: <b>${pendingFollowups}</b>

<i>Updated just now</i>`
}

async function cmdLeads(ctx: CommandContext): Promise<string> {
  const { workspaceId, args } = ctx

  // Parse optional limit
  const parts = args.split(' ')
  const limit = parseInt(parts[parts.length - 1]) || 10

  const topLeads = await db.contact.findMany({
    where: { workspaceId, status: 'active' },
    orderBy: { leadScore: 'desc' },
    take: Math.min(limit, 20),
    include: {
      leadProfile: {
        select: { temperature: true, score: true, archetype: true },
      },
    },
  })

  if (topLeads.length === 0) {
    return `<b>🎯 Top Leads</b>

No leads found in this workspace. Start conversations to generate leads!`
  }

  const lines = topLeads.map((lead, i) => {
    const name = `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}`
    const temp = lead.leadProfile?.temperature || lead.temperature || 'cold'
    const tempIcon = temp === 'hot' ? '🔴' : temp === 'warm' ? '🟡' : '🔵'
    const score = lead.leadProfile?.score || lead.leadScore || 0
    const lastMsg = lead.lastMessageAt ? timeAgo(new Date(lead.lastMessageAt)) : 'Never'
    return `  ${i + 1}. <b>${escapeHtml(name)}</b> ${tempIcon} ${score}pts — ${lastMsg}`
  })

  return `<b>🎯 Top ${topLeads.length} Leads by Score</b>

${lines.join('\n')}

<i>🔴 Hot  🟡 Warm  🔵 Cold</i>`
}

async function cmdDeals(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const activeDeals = await db.deal.findMany({
    where: { workspaceId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
    take: 15,
    include: {
      stage: { select: { name: true, color: true, probability: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
  })

  const wonToday = await db.deal.count({
    where: {
      workspaceId,
      status: 'won',
      wonAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  })

  const totalPipelineValue = await db.deal.aggregate({
    where: { workspaceId, status: 'active' },
    _sum: { value: true },
  })

  if (activeDeals.length === 0) {
    return `<b>💼 Active Deals</b>

No active deals. Keep working those leads!`
  }

  const lines = activeDeals.map((deal, i) => {
    const contactName = deal.contact
      ? `${deal.contact.firstName}${deal.contact.lastName ? ' ' + deal.contact.lastName : ''}`
      : 'No contact'
    const stageName = deal.stage?.name || 'Unknown'
    const prob = deal.stage?.probability || 0
    return `  ${i + 1}. <b>${escapeHtml(deal.title)}</b>
     👤 ${escapeHtml(contactName)} | ${escapeHtml(stageName)} (${prob}%)
     💵 ${formatCurrency(deal.value)}`
  })

  return `<b>💼 Active Deals (${activeDeals.length})</b>

🏆 Won today: <b>${wonToday}</b>
📈 Pipeline value: <b>${formatCurrency(totalPipelineValue._sum.value || 0)}</b>

${lines.join('\n\n')}`
}

async function cmdInbox(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const recentUnread = await db.conversation.findMany({
    where: {
      workspaceId,
      status: 'active',
      unreadCount: { gt: 0 },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 10,
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true } },
    },
  })

  if (recentUnread.length === 0) {
    return `<b>📭 Inbox</b>

✅ All caught up! No unread messages.`
  }

  const totalUnread = recentUnread.reduce((sum, c) => sum + c.unreadCount, 0)

  const lines = recentUnread.map((conv, i) => {
    const name = conv.contact
      ? `${conv.contact.firstName}${conv.contact.lastName ? ' ' + conv.contact.lastName : ''}`
      : 'Unknown'
    const preview = conv.lastMessagePreview
      ? escapeHtml(conv.lastMessagePreview.slice(0, 60))
      : 'No preview'
    const time = timeAgo(new Date(conv.lastMessageAt))
    return `  ${i + 1}. <b>${escapeHtml(name)}</b> (${conv.unreadCount} unread)
     💬 "${preview}..." — ${time}`
  })

  return `<b>📭 Inbox — ${totalUnread} unread</b>

${lines.join('\n\n')}`
}

async function cmdTemperature(ctx: CommandContext): Promise<string> {
  const { workspaceId, args } = ctx

  const contactName = args.replace(/^\/temperature\s*/i, '').trim()
  if (!contactName) {
    return `<b>🌡️ Temperature Command</b>

Usage: <code>/temperature [contact name]</code>

Example: <code>/temperature Juan Perez</code>`
  }

  const contacts = await db.contact.findMany({
    where: {
      workspaceId,
      status: 'active',
      OR: [
        { firstName: { contains: contactName } },
        { lastName: { contains: contactName } },
      ],
    },
    include: {
      leadProfile: {
        select: {
          temperature: true,
          score: true,
          archetype: true,
          totalMessages: true,
          lastActiveAt: true,
          urgencyLevel: true,
          buyingMotivation: true,
          mainObjection: true,
          painPoints: true,
          interests: true,
        },
      },
    },
    take: 5,
  })

  if (contacts.length === 0) {
    return `<b>🌡️ Temperature</b>

No contact found matching "<b>${escapeHtml(contactName)}</b>". Check the name and try again.`
  }

  const results = contacts.map((c: any) => {
    const name = `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`
    const profile = c.leadProfile
    const temp = profile?.temperature || c.temperature || 'cold'
    const score = profile?.score || c.leadScore || 0
    const tempIcon = temp === 'hot' ? '🔴' : temp === 'warm' ? '🟡' : '🔵'

    let detail = `${tempIcon} <b>${escapeHtml(name)}</b> — ${temp.toUpperCase()} (${score}/100)\n`

    if (profile) {
      if (profile.archetype && profile.archetype !== 'desconocido') {
        detail += `  Archetype: ${profile.archetype}\n`
      }
      if (profile.totalMessages > 0) {
        detail += `  Messages: ${profile.totalMessages}\n`
      }
      if (profile.lastActiveAt) {
        detail += `  Last active: ${timeAgo(new Date(profile.lastActiveAt))}\n`
      }
      if (profile.buyingMotivation) {
        detail += `  Motivation: ${profile.buyingMotivation}\n`
      }
      if (profile.mainObjection) {
        detail += `  Objection: ${profile.mainObjection}\n`
      }
      if (profile.urgencyLevel && profile.urgencyLevel !== 'low') {
        detail += `  Urgency: ${profile.urgencyLevel}\n`
      }
    } else {
      detail += `  Lead Score: ${score}\n`
    }

    return detail
  })

  return `<b>🌡️ NEXUS Temperature</b>

${results.join('\n')}`
}

async function cmdMemory(ctx: CommandContext): Promise<string> {
  const { workspaceId, args } = ctx

  const contactName = args.replace(/^\/memory\s*/i, '').trim()
  if (!contactName) {
    return `<b>🧠 Memory Command</b>

Usage: <code>/memory [contact name]</code>

Example: <code>/memory Juan Perez</code>`
  }

  const contacts = await db.contact.findMany({
    where: {
      workspaceId,
      OR: [
        { firstName: { contains: contactName } },
        { lastName: { contains: contactName } },
      ],
    },
    include: {
      agentMemories: {
        include: { agent: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      },
    },
    take: 3,
  })

  if (contacts.length === 0) {
    return `<b>🧠 Memory</b>

No contact found matching "<b>${escapeHtml(contactName)}</b>".`
  }

  const results = contacts.map((c: any) => {
    const name = `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`
    if (!c.agentMemories || c.agentMemories.length === 0) {
      return `<b>${escapeHtml(name)}</b> — No memories stored yet.`
    }
    const memories = c.agentMemories.map((m: any) => {
      return `  • <b>${escapeHtml(m.key)}</b>: ${escapeHtml(m.value.slice(0, 100))} [${m.agent.name}]`
    }).join('\n')
    return `<b>${escapeHtml(name)}</b> (${c.agentMemories.length} memories):\n${memories}`
  })

  return `<b>🧠 Agent Memories</b>

${results.join('\n\n')}`
}

async function cmdPause(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const bot = await findBotByWorkspace(workspaceId)

  if (!bot) {
    return '❌ No Telegram bot configured for this workspace.'
  }

  if (bot.pausedAt) {
    return `<b>⏸️ Automations Already Paused</b>

Paused since ${timeAgo(new Date(bot.pausedAt))}.

Use <b>/resume</b> to reactivate.`
  }

  await setWorkspaceTelegramPaused(workspaceId, new Date())

  // Also pause all active automations
  const pausedCount = await db.automation.updateMany({
    where: { workspaceId, isActive: true },
    data: { isActive: false },
  })

  return `<b>⏸️ Automations Paused</b>

All automations have been paused.
  Automations paused: <b>${pausedCount.count}</b>
  Follow-up rules: still queued but won't execute

Use <b>/resume</b> to reactivate everything.`
}

async function cmdResume(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const bot = await findBotByWorkspace(workspaceId)

  if (!bot) {
    return '❌ No Telegram bot configured for this workspace.'
  }

  if (!bot.pausedAt) {
    return `<b>▶️ Automations Already Active</b>

Everything is running normally.`
  }

  await setWorkspaceTelegramPaused(workspaceId, null)

  // Re-enable automations that were previously active
  // We re-activate based on the workspace — this is a blanket resume
  const resumedCount = await db.automation.updateMany({
    where: { workspaceId, isActive: false },
    data: { isActive: true },
  })

  return `<b>▶️ Automations Resumed</b>

All systems back online!
  Automations reactivated: <b>${resumedCount.count}</b>
  Follow-ups: processing queue

<i>All clear — operations resumed at ${new Date().toLocaleTimeString('es-MX')}</i>`
}

async function cmdAgents(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const agents = await db.agent.findMany({
    where: { workspaceId },
    orderBy: { priority: 'desc' },
    include: {
      _count: {
        select: {
          logs: true,
          memories: true,
          followUpRules: true,
        },
      },
    },
  })

  if (agents.length === 0) {
    return `<b>🤖 Active Agents</b>

No agents configured yet. Create agents in the ValiAutoFlow dashboard to get started.`
  }

  // Get recent agent activity (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentLogsCount = await db.agentLog.count({
    where: {
      agent: { workspaceId },
      createdAt: { gte: yesterday },
    },
  })

  const lines = agents.map((agent) => {
    const statusIcon = agent.isActive ? '🟢' : '🔴'
    const personality = agent.personality || 'default'
    const model = agent.modelName || agent.model
    return `  ${statusIcon} <b>${escapeHtml(agent.name)}</b>
     Type: ${agent.type} | Personality: ${personality}
     Model: ${model} | Logs: ${agent._count.logs}
     Memories: ${agent._count.memories} | Follow-up rules: ${agent._count.followUpRules}`
  })

  return `<b>🤖 Agents (${agents.length} total)</b>
📊 Activity (24h): <b>${recentLogsCount}</b> interactions

${lines.join('\n\n')}`
}

async function cmdAnalytics(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    contactsTotal,
    contactsToday,
    conversationsToday,
    messagesToday,
    dealsWonToday,
    dealsWonWeek,
    dealsTotalValue,
    avgLeadScore,
    hotLeads,
    agentsActive,
    automationRuns,
  ] = await Promise.all([
    db.contact.count({ where: { workspaceId } }),
    db.contact.count({
      where: { workspaceId, createdAt: { gte: today } },
    }),
    db.conversation.count({
      where: { workspaceId, createdAt: { gte: today } },
    }),
    db.message.count({
      where: { conversation: { workspaceId }, createdAt: { gte: today } },
    }),
    db.deal.count({
      where: { workspaceId, status: 'won', wonAt: { gte: today } },
    }),
    db.deal.count({
      where: { workspaceId, status: 'won', wonAt: { gte: sevenDaysAgo } },
    }),
    db.deal.aggregate({
      where: { workspaceId, status: 'active' },
      _sum: { value: true },
      _avg: { value: true },
    }),
    db.contact.aggregate({
      where: { workspaceId, status: 'active' },
      _avg: { leadScore: true },
    }),
    db.contact.count({
      where: { workspaceId, temperature: 'hot' },
    }),
    db.agent.count({
      where: { workspaceId, isActive: true },
    }),
    db.automationLog.count({
      where: { workspaceId, createdAt: { gte: today } },
    }),
  ])

  const revenueWeek = await db.deal.aggregate({
    where: { workspaceId, status: 'won', wonAt: { gte: sevenDaysAgo } },
    _sum: { value: true },
  })

  return `<b>📈 Quick Analytics</b>

<b>📊 Today:</b>
  New Contacts: <b>${contactsToday}</b>
  Conversations: <b>${conversationsToday}</b>
  Messages: <b>${messagesToday}</b>
  Deals Won: <b>${dealsWonToday}</b>
  Auto Runs: <b>${automationRuns}</b>

<b>📅 This Week:</b>
  Deals Won: <b>${dealsWonWeek}</b>
  Revenue: <b>${formatCurrency(revenueWeek._sum.value || 0)}</b>

<b>🎯 CRM Health:</b>
  Total Contacts: <b>${contactsTotal}</b>
  Hot Leads: <b>${hotLeads}</b>
  Avg Lead Score: <b>${Math.round(avgLeadScore._avg.leadScore || 0)}</b>
  Pipeline Value: <b>${formatCurrency(dealsTotalValue._sum.value || 0)}</b>
  Active Agents: <b>${agentsActive}</b>

<i>Auto-generated summary</i>`
}

async function cmdFollowups(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const pendingTasks = await db.followUpTask.findMany({
    where: { workspaceId, status: 'pending' },
    orderBy: { scheduledAt: 'asc' },
    take: 15,
    select: {
      id: true,
      contactId: true,
      ruleId: true,
      scheduledAt: true,
      retryCount: true,
    },
  })
  const [contacts, rules] = await Promise.all([
    db.contact.findMany({
      where: { workspaceId, id: { in: pendingTasks.map((task) => task.contactId) } },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.followUpRule.findMany({
      where: { workspaceId, id: { in: pendingTasks.map((task) => task.ruleId) } },
      select: { id: true, name: true, channel: true },
    }),
  ])
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]))
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]))

  const overdueTasks = await db.followUpTask.count({
    where: {
      workspaceId,
      status: 'pending',
      scheduledAt: { lt: new Date() },
    },
  })

  const failedTasks = await db.followUpTask.count({
    where: { workspaceId, status: 'failed' },
  })

  if (pendingTasks.length === 0) {
    return `<b>📞 Follow-ups</b>

✅ No pending follow-ups. You're all caught up!`
  }

  const lines = pendingTasks.map((task, i) => {
    const contact = contactsById.get(task.contactId)
    const rule = rulesById.get(task.ruleId)
    const name = contact
      ? `${contact.firstName}${contact.lastName ? ' ' + contact.lastName : ''}`
      : 'Unknown'
    const dueDate = task.scheduledAt < new Date() ? '🔴 OVERDUE' : `📅 ${timeAgo(new Date(task.scheduledAt))}`
    const channel = rule?.channel || 'whatsapp'
    const channelIcon = channel === 'whatsapp' ? '💬' : channel === 'telegram' ? '✈️' : '📱'
    return `  ${i + 1}. <b>${escapeHtml(name)}</b> ${dueDate}
     ${channelIcon} ${escapeHtml(rule?.name || 'Follow-up')} | Retry: ${task.retryCount}`
  })

  return `<b>📞 Pending Follow-ups (${pendingTasks.length})</b>

⚠️ Overdue: <b>${overdueTasks}</b> | ❌ Failed: <b>${failedTasks}</b>

${lines.join('\n\n')}`
}

async function cmdCalendar(ctx: CommandContext): Promise<string> {
  const { workspaceId } = ctx

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayEvents = await db.appointment.findMany({
    where: {
      workspaceId,
      date: { gte: today, lt: tomorrow },
      status: { in: ['pending', 'completed'] },
    },
    orderBy: { date: 'asc' },
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true } },
    },
  })

  // Also show upcoming follow-ups due today
  const todayFollowups = await db.followUpTask.count({
    where: {
      workspaceId,
      status: 'pending',
      scheduledAt: { gte: today, lt: tomorrow },
    },
  })

  if (todayEvents.length === 0 && todayFollowups === 0) {
    return `<b>📅 Today's Calendar</b>

${today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

✅ Clear schedule! No events or follow-ups for today.

<i>Enjoy the quiet or go hunt some leads 🎯</i>`
  }

  const eventLines = todayEvents.map((evt) => {
    const time = evt.date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const name = evt.contact
      ? `${evt.contact.firstName}${evt.contact.lastName ? ' ' + evt.contact.lastName : ''}`
      : 'No contact'
    const statusIcon = evt.status === 'completed' ? '✅' : '⏳'
    return `  ${statusIcon} <b>${time}</b> — ${escapeHtml(evt.title)}
     👤 ${escapeHtml(name)} | ${evt.duration}min | ${evt.type}`
  })

  return `<b>📅 Today's Calendar</b>

${today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

<b>Events (${todayEvents.length}):</b>
${eventLines.join('\n\n') || '  None'}

<b>📞 Follow-ups due today:</b> ${todayFollowups}`
}

function cmdHelp(_ctx: CommandContext): Promise<string> {
  const help = `<b>📚 ValiAutoFlow Commands</b>

<b>📊 Dashboard:</b>
  /status — System overview & metrics
  /analytics — Quick analytics summary
  /calendar — Today's events & follow-ups

<b>🎯 Leads & Deals:</b>
  /leads [n] — Top leads by score (default 10)
  /deals — Active deals & pipeline
  /inbox — Recent unread messages

<b>🔍 Intelligence:</b>
  /temperature [name] — NEXUS emotional temp
  /memory [name] — Agent memories for contact

<b>🤖 Control:</b>
  /pause — Pause all automations
  /resume — Resume automations
  /agents — Active agents status

<b>📞 Follow-ups:</b>
  /followups — Pending follow-ups

<b>🆘 Other:</b>
  /start — Welcome message
  /help — This help message

<i>Tips: Use contact names without the / prefix for temperature and memory commands.</i>`

  return Promise.resolve(help)
}

// ─── HTML Escape Helper ──────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION SYSTEM — 10 Notification Types
// ═══════════════════════════════════════════════════════════════

const NOTIFICATION_ICONS: Record<TelegramNotificationType, string> = {
  new_message: '💬',
  lead_temperature_spike: '🌡️',
  deal_stage_change: '💼',
  ghosting_detected: '👻',
  followup_due: '📞',
  automation_triggered: '⚡',
  error_alert: '🚨',
  daily_summary: '📊',
  weekly_report: '📈',
  nexus_emotional_alert: '🧠',
}

const NOTIFICATION_TITLES: Record<TelegramNotificationType, string> = {
  new_message: 'New Message',
  lead_temperature_spike: 'Temperature Spike',
  deal_stage_change: 'Deal Stage Changed',
  ghosting_detected: 'Ghosting Detected',
  followup_due: 'Follow-up Due',
  automation_triggered: 'Automation Triggered',
  error_alert: 'System Alert',
  daily_summary: 'Daily Summary',
  weekly_report: 'Weekly Report',
  nexus_emotional_alert: 'NEXUS Emotional Alert',
}

/**
 * Send a notification to Telegram.
 * This is the main function that other parts of the system call
 * to push notifications to the Telegram bot.
 */
export async function sendNotification(
  payload: TelegramNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const bot = await findBotByWorkspace(payload.workspaceId)
    if (!bot || !bot.isActive || !bot.chatId) {
      return { success: false, error: 'No active Telegram bot or chat ID configured' }
    }

    // Check if paused (only block non-critical notifications)
    if (bot.pausedAt && !['error_alert', 'ghosting_detected'].includes(payload.type)) {
      return { success: false, error: 'Automations paused' }
    }

    const icon = NOTIFICATION_ICONS[payload.type]
    const title = NOTIFICATION_TITLES[payload.type]

    let message = `${icon} <b>${title}</b>\n\n`

    if (payload.contactName) {
      message += `👤 <b>${escapeHtml(payload.contactName)}</b>\n`
    }

    message += `${escapeHtml(payload.body)}`

    // Add metadata context
    if (payload.metadata) {
      const metaLines: string[] = []
      if (payload.metadata.dealTitle) {
        metaLines.push(`💼 ${escapeHtml(String(payload.metadata.dealTitle))}`)
      }
      if (payload.metadata.temperature) {
        metaLines.push(`🌡️ ${String(payload.metadata.temperature)}`)
      }
      if (payload.metadata.stage) {
        metaLines.push(`📍 ${escapeHtml(String(payload.metadata.stage))}`)
      }
      if (payload.metadata.automationName) {
        metaLines.push(`⚡ ${escapeHtml(String(payload.metadata.automationName))}`)
      }
      if (payload.metadata.score) {
        metaLines.push(`📊 Score: ${payload.metadata.score}`)
      }
      if (metaLines.length > 0) {
        message += `\n\n${metaLines.join('\n')}`
      }
    }

    return await sendTelegramMessage(bot.botToken, bot.chatId, message)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram] sendNotification failed:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Send a daily summary notification.
 * Queries actual data and formats a comprehensive summary.
 */
export async function sendDailySummary(workspaceId: string): Promise<{ success: boolean; error?: string }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    newContacts,
    newConversations,
    messagesReceived,
    messagesSent,
    dealsWon,
    dealsWonValue,
    dealsLost,
    followupsSent,
    hotLeadsNow,
    pendingFollowups,
    automationsRun,
  ] = await Promise.all([
    db.contact.count({ where: { workspaceId, createdAt: { gte: today } } }),
    db.conversation.count({ where: { workspaceId, createdAt: { gte: today } } }),
    db.message.count({ where: { conversation: { workspaceId }, direction: 'inbound', createdAt: { gte: today } } }),
    db.message.count({ where: { conversation: { workspaceId }, direction: 'outbound', createdAt: { gte: today } } }),
    db.deal.count({ where: { workspaceId, status: 'won', wonAt: { gte: today } } }),
    db.deal.aggregate({ where: { workspaceId, status: 'won', wonAt: { gte: today } }, _sum: { value: true } }),
    db.deal.count({ where: { workspaceId, status: 'lost', lostAt: { gte: today } } }),
    db.followUpTask.count({ where: { workspaceId, status: 'sent', sentAt: { gte: today } } }),
    db.contact.count({ where: { workspaceId, temperature: 'hot' } }),
    db.followUpTask.count({ where: { workspaceId, status: 'pending', scheduledAt: { lte: new Date() } } }),
    db.automationLog.count({ where: { workspaceId, createdAt: { gte: today } } }),
  ])

  const body = [
    `👥 New Contacts: ${newContacts}`,
    `💬 Conversations: ${newConversations}`,
    `📥 Messages Received: ${messagesReceived}`,
    `📤 Messages Sent: ${messagesSent}`,
    ``,
    `🏆 Deals Won: ${dealsWon} (${formatCurrency(dealsWonValue._sum.value || 0)})`,
    `❌ Deals Lost: ${dealsLost}`,
    ``,
    `📞 Follow-ups Sent: ${followupsSent}`,
    `⚠️ Overdue Follow-ups: ${pendingFollowups}`,
    `🔴 Hot Leads: ${hotLeadsNow}`,
    `⚡ Automations Run: ${automationsRun}`,
  ].join('\n')

  return sendNotification({
    type: 'daily_summary',
    workspaceId,
    title: 'Daily Summary',
    body,
    metadata: { date: today.toLocaleDateString('es-MX') } as Record<string, unknown>,
  })
}

/**
 * Send a weekly report notification.
 */
export async function sendWeeklyReport(workspaceId: string): Promise<{ success: boolean; error?: string }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    newContactsWeek,
    totalConversations,
    totalMessages,
    dealsWonWeek,
    dealsWonValue,
    dealsLostWeek,
    topLead,
    totalPipelineValue,
  ] = await Promise.all([
    db.contact.count({ where: { workspaceId, createdAt: { gte: weekAgo } } }),
    db.conversation.count({ where: { workspaceId, createdAt: { gte: weekAgo } } }),
    db.message.count({ where: { conversation: { workspaceId }, createdAt: { gte: weekAgo } } }),
    db.deal.count({ where: { workspaceId, status: 'won', wonAt: { gte: weekAgo } } }),
    db.deal.aggregate({ where: { workspaceId, status: 'won', wonAt: { gte: weekAgo } }, _sum: { value: true } }),
    db.deal.count({ where: { workspaceId, status: 'lost', lostAt: { gte: weekAgo } } }),
    db.contact.findFirst({
      where: { workspaceId, status: 'active' },
      orderBy: { leadScore: 'desc' },
      select: { firstName: true, lastName: true, leadScore: true },
    }),
    db.deal.aggregate({ where: { workspaceId, status: 'active' }, _sum: { value: true } }),
  ])

  const winRate = dealsWonWeek + dealsLostWeek > 0
    ? Math.round((dealsWonWeek / (dealsWonWeek + dealsLostWeek)) * 100)
    : 0

  const body = [
    `📊 <b>Weekly Performance Report</b>`,
    ``,
    `👥 New Contacts: <b>${newContactsWeek}</b>`,
    `💬 Conversations: <b>${totalConversations}</b>`,
    `📨 Total Messages: <b>${totalMessages}</b>`,
    ``,
    `🏆 Deals Won: <b>${dealsWonWeek}</b>`,
    `❌ Deals Lost: <b>${dealsLostWeek}</b>`,
    `📈 Win Rate: <b>${winRate}%</b>`,
    `💰 Revenue: <b>${formatCurrency(dealsWonValue._sum.value || 0)}</b>`,
    `📋 Pipeline: <b>${formatCurrency(totalPipelineValue._sum.value || 0)}</b>`,
    ``,
    `🌟 Top Lead: <b>${topLead ? `${topLead.firstName} (${topLead.leadScore}pts)` : 'N/A'}</b>`,
  ].join('\n')

  return sendNotification({
    type: 'weekly_report',
    workspaceId,
    title: 'Weekly Report',
    body,
    metadata: { period: '7 days', winRate } as Record<string, unknown>,
  })
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK HANDLER — Main entry point for Telegram updates
// ═══════════════════════════════════════════════════════════════

/**
 * Process an incoming Telegram update.
 * Called from the webhook API route.
 */
export async function processTelegramUpdate(
  update: TelegramUpdate
): Promise<{ processed: boolean; reply?: string; error?: string }> {
  try {
    const message = update.message
    if (!message?.text || !message.from) {
      return { processed: false, error: 'No text message or sender' }
    }

    const text = message.text.trim()
    if (!text.startsWith('/')) {
      // Non-command message — could be an AI chat or just ignore
      // For now, only process commands
      return { processed: false, error: 'Not a command' }
    }

    // Find the bot by token (passed via header from webhook route)
    // We need the bot token to identify the workspace
    // The webhook route handles this mapping
    const botToken = '' // Will be set by the webhook route before calling this
    // This function is actually called with the botToken passed separately
    // See webhook route for the actual call pattern

    return { processed: false, error: 'Bot token not resolved — use handleTelegramWebhook instead' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram] processTelegramUpdate error:', msg)
    return { processed: false, error: msg }
  }
}

/**
 * Full webhook handler with bot token resolution.
 * This is what the API route should call.
 */
export async function handleTelegramWebhook(
  update: TelegramUpdate,
  botToken: string,
  workspaceId?: string
): Promise<{ processed: boolean; reply?: string; error?: string }> {
  try {
    const message = update.message
    if (!message?.text || !message.from) {
      return { processed: false, error: 'No text message or sender' }
    }

    const text = message.text.trim()

    // Find the bot and workspace
    const bot = await findBotByToken(botToken, workspaceId)
    if (!workspaceId) {
      return { processed: false, error: 'Workspace context required for Telegram webhook' }
    }
    if (!bot || !bot.isActive) {
      return { processed: false, error: 'Bot not found or inactive' }
    }

    const chatId = String(message.chat.id)
    const userName = message.from.first_name || message.from.username || 'User'

    // Authorize the chat: only allow the configured chatId, or register on /start
    if (bot.chatId && bot.chatId !== chatId) {
      return { processed: false, error: 'Unauthorized chat' }
    }

    // If this is the first message (no chatId set), register it
    if (!bot.chatId && text.startsWith('/start')) {
      const workspace = await db.workspace.findUnique({ where: { id: bot.workspaceId }, select: { ownerId: true } })
      if (!workspace) return { processed: false, error: 'Workspace not found' }
      await db.user.update({ where: { id: workspace.ownerId }, data: { telegramChatId: chatId } })
      console.log(`[Telegram] Registered chat ${chatId} for workspace ${bot.workspaceId}`)
    }

    if (!text.startsWith('/')) {
      // Handle non-command text with AI
      const aiReply = await handleFreeText(bot.workspaceId, bot.workspace.name, text, userName)
      const sendResult = await sendTelegramMessage(botToken, chatId, aiReply)
      return { processed: true, reply: aiReply, error: sendResult.error }
    }

    // Process command
    const ctx: CommandContext = {
      botToken,
      chatId,
      workspaceId: bot.workspaceId,
      workspaceName: bot.workspace.name,
      userName,
      args: text.slice(1), // Remove leading /
    }

    const reply = await handleCommand(ctx)
    const sendResult = await sendTelegramMessage(botToken, chatId, reply)

    return { processed: true, reply, error: sendResult.error }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram] handleTelegramWebhook error:', msg)
    return { processed: false, error: msg }
  }
}

/**
 * Handle free-form text messages (non-commands) with AI.
 */
async function handleFreeText(
  workspaceId: string,
  workspaceName: string,
  userMessage: string,
  userName: string
): Promise<string> {
  try {
    // Get quick workspace context for AI
    const [contactCount, dealCount, pendingTasks] = await Promise.all([
      db.contact.count({ where: { workspaceId } }),
      db.deal.count({ where: { workspaceId, status: 'active' } }),
      db.followUpTask.count({ where: { workspaceId, status: 'pending' } }),
    ])

    const result = await chatWithAI([
      {
        role: 'system',
        content: `You are a helpful CRM assistant for ValiAutoFlow workspace "${workspaceName}".
You respond to quick questions from the user (${userName}) about their sales pipeline.
Be concise, helpful, and use emojis sparingly. Keep responses under 5 lines.
Current context: ${contactCount} contacts, ${dealCount} active deals, ${pendingTasks} pending follow-ups.
Respond in the same language the user writes in.`,
      },
      { role: 'user', content: userMessage },
    ], 'glm')

    return result.content
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram] AI free-text handler failed:', msg)
    return `Sorry, I couldn't process that. Try using one of the commands — type /help to see available options.`
  }
}

// ═══════════════════════════════════════════════════════════════
// BOT MANAGEMENT — Setup, Token validation, etc.
// ═══════════════════════════════════════════════════════════════

export interface TelegramBotSetupResult {
  success: boolean
  botInfo?: { id: number; username?: string; first_name: string }
  error?: string
}

/**
 * Register a Telegram bot for a workspace.
 * Validates the token, gets bot info, and stores in DB.
 */
export async function setupTelegramBot(
  workspaceId: string,
  botToken: string,
  webhookUrl?: string
): Promise<TelegramBotSetupResult> {
  try {
    // Validate token by calling getMe
    const botInfo = await getTelegramBotInfo(botToken)
    if (!botInfo) {
      return { success: false, error: 'Invalid bot token. Could not verify with Telegram API.' }
    }

        const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    if (!workspace) return { success: false, error: 'Workspace not found' }
    const settings = parseWorkspaceSettings(workspace.settings)
    settings.telegramBotToken = botToken
    settings.telegramBotUsername = botInfo.username || settings.telegramBotUsername
    let webhookSecret: string | undefined
    if (webhookUrl) {
      webhookSecret = crypto.randomBytes(32).toString('hex')
      settings.telegramWebhookSecret = webhookSecret
      await setTelegramWebhook(botToken, webhookUrl, webhookSecret)
    }
    await db.workspace.update({
      where: { id: workspaceId },
      data: { telegramBotToken: botToken, settings: JSON.stringify(settings) },
    })

    console.log(`[Telegram] Bot registered for workspace ${workspaceId}: @${botInfo.username || botInfo.id}`)

    return { success: true, botInfo }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Telegram] setupTelegramBot failed:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Disconnect/remove a Telegram bot for a workspace.
 */
export async function disconnectTelegramBot(
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bot = await findBotByWorkspace(workspaceId)
    if (!bot) {
      return { success: false, error: 'No Telegram bot configured' }
    }

    // Remove webhook
    await deleteTelegramWebhook(bot.botToken)

    const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const settings = parseWorkspaceSettings(workspace?.settings)
    delete settings.telegramBotToken
    delete settings.telegramBotUsername
    delete settings.telegramWebhookSecret
    delete settings.telegramPausedAt
    await db.workspace.update({
      where: { id: workspaceId },
      data: { telegramBotToken: null, settings: JSON.stringify(settings) },
    })

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

/**
 * Get the current Telegram bot status for a workspace.
 */
export async function getTelegramBotStatus(workspaceId: string) {
  const bot = await findBotByWorkspace(workspaceId)
  if (!bot) {
    return { configured: false }
  }

  const botInfo = await getTelegramBotInfo(bot.botToken)

  return {
    configured: true,
    isActive: bot.isActive,
    chatId: bot.chatId,
    paused: !!bot.pausedAt,
    pausedAt: bot.pausedAt,
    botInfo: botInfo ? {
      id: botInfo.id,
      username: botInfo.username,
      firstName: botInfo.first_name,
    } : null,
    connectedAt: bot.createdAt,
  }
}

// ─── Convenience Exports ─────────────────────────────────────

/**
 * Quick-access notification functions for each type.
 * These can be imported and called directly from other modules.
 */

export function notifyNewMessage(workspaceId: string, contactName: string, preview: string) {
  return sendNotification({
    type: 'new_message',
    workspaceId,
    title: 'New Message',
    body: preview.slice(0, 200),
    contactName,
  })
}

export function notifyTemperatureSpike(
  workspaceId: string,
  contactName: string,
  fromTemp: string,
  toTemp: string,
  score: number
) {
  return sendNotification({
    type: 'lead_temperature_spike',
    workspaceId,
    title: 'Temperature Spike',
    body: `${contactName}: ${fromTemp} → ${toTemp} (${score}pts)`,
    contactName,
    metadata: { temperature: toTemp, score },
  })
}

export function notifyDealStageChange(
  workspaceId: string,
  dealTitle: string,
  contactName: string,
  fromStage: string,
  toStage: string
) {
  return sendNotification({
    type: 'deal_stage_change',
    workspaceId,
    title: 'Deal Stage Changed',
    body: `"${dealTitle}" moved from ${fromStage} to ${toStage}`,
    contactName,
    metadata: { dealTitle, stage: toStage },
  })
}

export function notifyGhostingDetected(
  workspaceId: string,
  contactName: string,
  lastSeen: string
) {
  return sendNotification({
    type: 'ghosting_detected',
    workspaceId,
    title: 'Ghosting Detected',
    body: `${contactName} hasn't responded since ${lastSeen}. Consider a follow-up.`,
    contactName,
  })
}

export function notifyFollowupDue(
  workspaceId: string,
  contactName: string,
  ruleName: string
) {
  return sendNotification({
    type: 'followup_due',
    workspaceId,
    title: 'Follow-up Due',
    body: `Scheduled follow-up for ${contactName}: "${ruleName}"`,
    contactName,
    metadata: { automationName: ruleName },
  })
}

export function notifyAutomationTriggered(
  workspaceId: string,
  automationName: string,
  contactName?: string
) {
  return sendNotification({
    type: 'automation_triggered',
    workspaceId,
    title: 'Automation Triggered',
    body: `"${automationName}" executed successfully.`,
    contactName,
    metadata: { automationName },
  })
}

export function notifyErrorAlert(
  workspaceId: string,
  errorTitle: string,
  errorMessage: string
) {
  return sendNotification({
    type: 'error_alert',
    workspaceId,
    title: 'System Alert',
    body: `${errorTitle}\n${errorMessage.slice(0, 300)}`,
  })
}

export function notifyNexusEmotionalAlert(
  workspaceId: string,
  contactName: string,
  emotion: string,
  intensity: string
) {
  return sendNotification({
    type: 'nexus_emotional_alert',
    workspaceId,
    title: 'NEXUS Emotional Alert',
    body: `${contactName} showing ${intensity} ${emotion} signals. Adjust approach.`,
    contactName,
    metadata: { temperature: intensity },
  })
}
