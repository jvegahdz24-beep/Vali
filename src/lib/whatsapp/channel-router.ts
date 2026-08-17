// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Channel Router
// Routes outbound messages to either Baileys or Meta Cloud API
// based on per-workspace configuration (Workspace.waChannel)
// ═══════════════════════════════════════════════════════════════

import { db } from '@/lib/db'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { sendMetaTextMessage, sendMetaImageMessage, sendMetaTemplateMessage, type MetaTemplateComponent, type MetaSendResult } from '@/lib/whatsapp/meta-api'
import { logError } from '@/lib/logger'

export type WhatsAppChannel = 'baileys' | 'meta'

// ─── Channel Detection ────────────────────────────────────────

/**
 * Returns the active WhatsApp channel for a workspace.
 * Falls back to 'baileys' if Meta config is missing or inactive.
 */
export async function getActiveChannel(workspaceId: string): Promise<WhatsAppChannel> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { waChannel: true },
  })
  if (!ws || ws.waChannel !== 'meta') return 'baileys'

  // Verify Meta config actually exists and is active
  const config = await db.metaApiConfig.findUnique({
    where: { workspaceId },
    select: { isActive: true },
  })
  if (!config?.isActive) return 'baileys'

  return 'meta'
}

/**
 * Get Meta config for a workspace (throws if missing/inactive)
 */
async function getMetaConfig(workspaceId: string) {
  const config = await db.metaApiConfig.findUnique({
    where: { workspaceId },
    select: { phoneNumberId: true, accessToken: true, isActive: true },
  })
  if (!config?.isActive) throw new Error('Meta API not configured or inactive for workspace')
  return config
}

// ─── Outbound Send Functions ──────────────────────────────────

/**
 * Send a text message through the workspace's active channel
 */
export async function routedSendText(
  workspaceId: string,
  phone: string,
  text: string
): Promise<MetaSendResult> {
  const channel = await getActiveChannel(workspaceId)

  if (channel === 'meta') {
    const config = await getMetaConfig(workspaceId)
    return sendMetaTextMessage(config.phoneNumberId, config.accessToken, phone, text)
  }

  // Baileys path — use the per-workspace manager
  try {
    const manager = getWhatsAppManager(workspaceId)
    await manager.sendMessage(phone, text)
    return { success: true }
  } catch (err) {
    logError('WHATSAPP', '[ChannelRouter] Baileys send failed', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Send an image through the workspace's active channel
 */
export async function routedSendImage(
  workspaceId: string,
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<MetaSendResult> {
  const channel = await getActiveChannel(workspaceId)

  if (channel === 'meta') {
    const config = await getMetaConfig(workspaceId)
    return sendMetaImageMessage(config.phoneNumberId, config.accessToken, phone, imageUrl, caption)
  }

  // Baileys path — per-workspace manager
  try {
    const manager = getWhatsAppManager(workspaceId)
    await manager.sendMessageRaw(`${phone}@s.whatsapp.net`, {
      image: { url: imageUrl },
      caption: caption ?? '',
    })
    return { success: true }
  } catch (err) {
    logError('WHATSAPP', '[ChannelRouter] Baileys image send failed', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Send a WhatsApp template (Meta only — Baileys does not support official templates)
 */
export async function routedSendTemplate(
  workspaceId: string,
  phone: string,
  templateName: string,
  language: string,
  components?: MetaTemplateComponent[]
): Promise<MetaSendResult> {
  const channel = await getActiveChannel(workspaceId)
  if (channel !== 'meta') {
    return { success: false, error: 'Templates are only supported on the Meta Cloud API channel' }
  }

  const config = await getMetaConfig(workspaceId)
  return sendMetaTemplateMessage(
    config.phoneNumberId,
    config.accessToken,
    phone,
    templateName,
    language,
    components
  )
}
