// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Evolution API Compatibility Layer
// Alternative WhatsApp gateway using Evolution API (Docker)
// Can run alongside or instead of Baileys direct connection
//
// Evolution API: https://github.com/EvolutionAPI/evolution-api
// Setup: docker run -p 8080:8080 ghcr.io/EvolutionAPI/evolution-api:latest
// ═══════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────

interface EvolutionConfig {
  apiUrl: string      // e.g. http://localhost:8080
  apiKey: string      // API key for authentication
  instanceName: string // WhatsApp instance name
  enabled: boolean
}

interface EvolutionMessage {
  key: {
    remoteJid: string
    id: string
    fromMe: boolean
    participant?: string
  }
  message?: {
    conversation?: string
    extendedTextMessage?: { text: string }
    imageMessage?: { caption?: string; jpegThumbnail?: string }
    videoMessage?: { caption?: string }
    audioMessage?: object
    documentMessage?: { fileName?: string; jpegThumbnail?: string }
    stickerMessage?: object
  }
  messageTimestamp?: number
  pushName?: string
}

interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: {
    key?: EvolutionMessage['key']
    message?: EvolutionMessage['message']
    messageTimestamp?: number
    pushName?: string
    conversation?: string
    remoteJid?: string
  }
}

interface EvolutionStatus {
  instance: {
    state: 'open' | 'close' | 'connecting'
    connectionStatus: string
    battery: number
    plugged: boolean
  }
}

// ─── Evolution API Client ─────────────────────────────────────

class EvolutionAPIClient {
  private config: EvolutionConfig | null = null

  /**
   * Initialize the Evolution API client from environment variables.
   * Set EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME to enable.
   */
  async init(): Promise<boolean> {
    const apiUrl = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME

    if (!apiUrl || !apiKey || !instanceName) {
      console.log('[EvolutionAPI] Not configured — missing env vars')
      return false
    }

    this.config = {
      apiUrl: apiUrl.replace(/\/$/, ''),
      apiKey,
      instanceName,
      enabled: true,
    }

    console.log(`[EvolutionAPI] Configured: ${this.config.apiUrl} / ${this.config.instanceName}`)
    return true
  }

  isEnabled(): boolean {
    return this.config?.enabled === true
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.config) throw new Error('Evolution API not configured')

    const url = `${this.config.apiUrl}/${endpoint}`
    const headers: Record<string, string> = {
      'apikey': this.config.apiKey,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }

    return fetch(url, { ...options, headers })
  }

  // ─── Instance Management ──────────────────────────────────

  /**
   * Create a new WhatsApp instance
   */
  async createInstance(): Promise<{ success: boolean; qr?: string; error?: string }> {
    try {
      const resp = await this.request(`instance/create`, {
        method: 'POST',
        body: JSON.stringify({
          instanceName: this.config!.instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      })
      const data = await resp.json()
      return { success: true, qr: data.qrcode?.base64 }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<EvolutionStatus | null> {
    try {
      const resp = await this.request(`instance/fetchStatus/${this.config!.instanceName}`)
      const data = await resp.json()
      return data
    } catch {
      return null
    }
  }

  /**
   * Get QR code for connection
   */
  async getQR(): Promise<string | null> {
    try {
      const resp = await this.request(`instance/connect/${this.config!.instanceName}`, {
        method: 'POST',
      })
      const data = await resp.json()
      return data.qrcode?.base64 || data.base64 || null
    } catch {
      return null
    }
  }

  /**
   * Logout and disconnect
   */
  async logout(): Promise<boolean> {
    try {
      await this.request(`instance/logout/${this.config!.instanceName}`, { method: 'DELETE' })
      return true
    } catch {
      return false
    }
  }

  // ─── Messaging ──────────────────────────────────────────

  /**
   * Send a text message
   */
  async sendMessage(phone: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const jid = `${phone}@s.whatsapp.net`
      const resp = await this.request(`message/sendText/${this.config!.instanceName}`, {
        method: 'POST',
        body: JSON.stringify({
          number: jid,
          text,
        }),
      })
      const data = await resp.json()
      return { success: true, id: data.key?.id }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  /**
   * Send a media message (image, video, document)
   */
  async sendMedia(phone: string, mediaType: string, mediaUrl: string, caption?: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const jid = `${phone}@s.whatsapp.net`
      const resp = await this.request(`message/send${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}/${this.config!.instanceName}`, {
        method: 'POST',
        body: JSON.stringify({
          number: jid,
          mediatype: mediaType,
          media: mediaUrl,
          caption: caption || '',
        }),
      })
      const data = await resp.json()
      return { success: true, id: data.key?.id }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  // ─── Webhook Handling ──────────────────────────────────

  /**
   * Parse an incoming webhook payload from Evolution API
   */
  parseWebhook(payload: EvolutionWebhookPayload): {
    valid: boolean
    phone?: string
    messageText?: string
    pushName?: string
    externalId?: string
    mediaType?: string
  } {
    if (payload.event !== 'messages.upsert') {
      return { valid: false }
    }

    const data = payload.data
    if (!data) return { valid: false }

    // Skip messages from self
    if (data.key?.fromMe) return { valid: false }

    // Skip group messages
    const remoteJid = data.remoteJid || data.key?.remoteJid || ''
    if (remoteJid.includes('@g.us')) return { valid: false }

    const phone = remoteJid.split('@')[0]
    if (!phone) return { valid: false }

    // Extract text
    let messageText: string | undefined
    let mediaType: string | undefined

    const msg = data.message
    if (msg?.conversation) {
      messageText = msg.conversation
    } else if (msg?.extendedTextMessage?.text) {
      messageText = msg.extendedTextMessage.text
    } else if (msg?.imageMessage?.caption) {
      mediaType = 'image'
      messageText = msg.imageMessage.caption
    } else if (msg?.videoMessage?.caption) {
      mediaType = 'video'
      messageText = msg.videoMessage.caption
    } else if (msg?.documentMessage?.fileName) {
      mediaType = 'document'
      messageText = `[Documento] ${msg.documentMessage.fileName}`
    } else if (msg?.audioMessage) {
      mediaType = 'audio'
      messageText = '[Nota de voz]'
    } else if (msg?.stickerMessage) {
      mediaType = 'sticker'
      messageText = '[Sticker]'
    }

    return {
      valid: true,
      phone,
      messageText,
      pushName: data.pushName,
      externalId: data.key?.id,
      mediaType,
    }
  }

  // ─── Webhook Registration ───────────────────────────────

  /**
   * Register a webhook URL with Evolution API
   */
  async registerWebhook(webhookUrl: string, events: string[] = ['messages.upsert']): Promise<boolean> {
    try {
      await this.request(`webhook/set/${this.config!.instanceName}`, {
        method: 'POST',
        body: JSON.stringify({
          enabled: true,
          url: webhookUrl,
          webhookByEvents: true,
          events,
        }),
      })
      return true
    } catch {
      return false
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────

export const evolutionAPI = new EvolutionAPIClient()

export type { EvolutionConfig, EvolutionWebhookPayload, EvolutionStatus }
