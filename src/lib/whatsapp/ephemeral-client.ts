// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Ephemeral WhatsApp Client
// Baileys-based connection that auto-destroys after a timeout.
// NO persistent auth storage — each session starts fresh.
// Designed for on-demand sends, QR pairing, and short-lived tasks.
// ═══════════════════════════════════════════════════════════════

import pino from 'pino'
import QRCode from 'qrcode'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

// ─── Types ────────────────────────────────────────────────────

type WASocket = import('@whiskeysockets/baileys').WASocket
type WAMessage = import('@whiskeysockets/baileys').WAMessage

export interface EphemeralConfig {
  timeoutMs?: number        // Auto-destroy after idle (default: 30 min)
  maxLifetimeMs?: number    // Hard max lifetime (default: 2 hours)
  printQR?: boolean         // Print QR in terminal (default: false)
  ownerId?: string          // Authenticated user that created the session
  workspaceId?: string      // Tenant that owns the session
}

export interface EphemeralStatus {
  id: string
  connected: boolean
  connecting: boolean
  qrCode: string | null
  phone: string | null
  createdAt: string
  lastActivity: string | null
  destroysAt: string | null   // When auto-destroy triggers
  messagesReceived: number
  messagesSent: number
  mode: 'ephemeral'
}

type MessageHandler = (data: {
  from: string
  message: string
  pushName?: string
  remoteJid: string
  messageId: string
}) => void

// ─── Baileys Module Cache ─────────────────────────────────────

interface BaileysModule {
  makeWASocket: typeof import('@whiskeysockets/baileys').makeWASocket
  useMultiFileAuthState: typeof import('@whiskeysockets/baileys').useMultiFileAuthState
  fetchLatestBaileysVersion: typeof import('@whiskeysockets/baileys').fetchLatestBaileysVersion
  DisconnectReason: typeof import('@whiskeysockets/baileys').DisconnectReason
}

let baileysModule: BaileysModule | null = null

async function loadBaileys(): Promise<BaileysModule> {
  if (!baileysModule) {
    const baileys = await import('@whiskeysockets/baileys')
    baileysModule = {
      makeWASocket: baileys.makeWASocket,
      useMultiFileAuthState: baileys.useMultiFileAuthState,
      fetchLatestBaileysVersion: baileys.fetchLatestBaileysVersion,
      DisconnectReason: baileys.DisconnectReason,
    }
  }
  return baileysModule
}

// ═══════════════════════════════════════════════════════════════
// EphemeralClient Class
// ═══════════════════════════════════════════════════════════════

export class EphemeralClient {
  readonly id: string
  readonly ownerId: string | null
  readonly workspaceId: string | null
  private sock: WASocket | null = null
  private config: Required<Omit<EphemeralConfig, 'ownerId' | 'workspaceId'>>
  private _connected = false
  private _connecting = false
  private _phone: string | null = null
  private _lastActivity: string | null = null
  private _qrCode: string | null = null
  private _createdAt: string
  private _messagesReceived = 0
  private _messagesSent = 0
  private _destroyed = false
  private _messageHandler: MessageHandler | null = null

  // Timers
  private _idleTimer: ReturnType<typeof setTimeout> | null = null
  private _maxLifetimeTimer: ReturnType<typeof setTimeout> | null = null

  // Auth dir (unique per session, ephemeral)
  private _authDir: string

  constructor(config: EphemeralConfig = {}) {
    this.id = crypto.randomUUID().slice(0, 8)
    this.ownerId = config.ownerId ?? null
    this.workspaceId = config.workspaceId ?? null
    this.config = {
      timeoutMs: config.timeoutMs ?? 30 * 60 * 1000,       // 30 min
      maxLifetimeMs: config.maxLifetimeMs ?? 2 * 60 * 60 * 1000, // 2 hours
      printQR: config.printQR ?? false,
    }
    this._createdAt = new Date().toISOString()

    // Unique ephemeral auth directory
    this._authDir = path.join(process.cwd(), '.whatsapp-ephemeral', `session-${this.id}`)
    fs.mkdirSync(this._authDir, { recursive: true })

    console.log(`[Ephemeral:${this.id}] Created — timeout: ${this.config.timeoutMs / 1000}s, max: ${this.config.maxLifetimeMs / 1000}s`)
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async connect(): Promise<EphemeralStatus> {
    if (this._destroyed) throw new Error(`Client ${this.id} is destroyed`)
    if (this._connected) return this.getStatus()
    if (this._connecting) return this.getStatus()

    this._connecting = true

    try {
      const {
        makeWASocket,
        useMultiFileAuthState,
        fetchLatestBaileysVersion,
        DisconnectReason,
      } = await loadBaileys()

      const { state, saveCreds } = await useMultiFileAuthState(this._authDir)
      const { version } = await fetchLatestBaileysVersion()

      console.log(`[Ephemeral:${this.id}] Baileys v${version}, creating socket...`)

      const logger = pino({ level: 'silent' })

      this.sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: state.keys },
        logger,
        printQRInTerminal: this.config.printQR,
        generateHighQualityLinkPreview: true,
        browser: ['ValiFlow', 'Chrome', '120.0.0'],
        getMessage: async () => undefined as any,
      })

      // ─── Events ────────────────────────────────────────

      this.sock.ev.on('creds.update', async () => {
        await saveCreds()
        this.touch()
      })

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update
        console.log(`[Ephemeral:${this.id}] STATUS: ${connection || update}`)

        if (qr) {
          try {
            const qrPng = await QRCode.toDataURL(qr, { width: 300, margin: 2 })
            this._qrCode = qrPng.replace(/^data:image\/png;base64,/, '')
            console.log(`[Ephemeral:${this.id}] QR received`)
          } catch {
            this._qrCode = qr
          }
          this.touch()
        }

        if (connection === 'open') {
          console.log(`[Ephemeral:${this.id}] ✅ CONNECTED`)
          this._connected = true
          this._connecting = false
          this._qrCode = null
          try {
            if (this.sock?.user?.id) {
              this._phone = this.sock.user.id.split(':')[0]
            }
          } catch {
            this._phone = 'connected'
          }
          this.touch()
          this.resetIdleTimer()
        }

        if (connection === 'close') {
          this._connected = false
          this._connecting = false
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
          console.log(`[Ephemeral:${this.id}] Disconnected (code: ${statusCode})`)

          if (statusCode === DisconnectReason.loggedOut) {
            console.log(`[Ephemeral:${this.id}] Logged out — session dead`)
            this.destroy()
          }
          // Don't auto-reconnect in ephemeral mode — let the caller decide
        }
      })

      // ─── Messages ────────────────────────────────────
      this.sock.ev.on('messages.upsert', async (m: any) => {
        try {
          const msg = m.messages[0] as WAMessage
          if (!msg || msg.key.fromMe) return

          const remoteJid = msg.key.remoteJid || ''
          if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) return
          if (m.type !== 'notify') return

          // Resolve real phone: @lid messages carry it in key.remoteJidAlt.
          let phone = remoteJid.split('@')[0]
          if (remoteJid.endsWith('@lid')) {
            const alt = (msg.key as any)?.remoteJidAlt || (msg.key as any)?.participantAlt
            const pn = typeof alt === 'string' ? alt.split('@')[0] : ''
            if (/^\d{8,15}$/.test(pn)) phone = pn
          }
          const text = this.extractText(msg)
          if (!text) return

          this._messagesReceived++
          this.touch()

          console.log(`[Ephemeral:${this.id}] Message from ${phone}: ${text.slice(0, 60)}`)

          if (this._messageHandler) {
            this._messageHandler({
              from: phone,
              message: text,
              pushName: msg.pushName || undefined,
              remoteJid,
              messageId: msg.key.id!,
            })
          }
        } catch (err) {
          console.error(`[Ephemeral:${this.id}] Message error:`, err)
        }
      })

      // Start max lifetime timer
      this._maxLifetimeTimer = setTimeout(() => {
        console.log(`[Ephemeral:${this.id}] Max lifetime reached (${this.config.maxLifetimeMs / 1000}s)`)
        this.destroy()
      }, this.config.maxLifetimeMs)

      this.touch()
      return this.getStatus()

    } catch (error) {
      this._connecting = false
      console.error(`[Ephemeral:${this.id}] Connect failed:`, error)
      throw error
    }
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return
    this._destroyed = true
    this._connected = false
    this._connecting = false

    // Clear timers
    if (this._idleTimer) clearTimeout(this._idleTimer)
    if (this._maxLifetimeTimer) clearTimeout(this._maxLifetimeTimer)

    // Close socket
    try {
      if (this.sock) {
        ;(this.sock.ev as any).removeAllListeners()
        try { await this.sock.logout(undefined) } catch { /* ok */ }
        this.sock = null
      }
    } catch {
      // ignore
    }

    // Clean up auth directory
    try {
      if (fs.existsSync(this._authDir)) {
        fs.rmSync(this._authDir, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }

    console.log(`[Ephemeral:${this.id}] Destroyed and auth cleaned`)
  }

  // ─── Send ────────────────────────────────────────────────

  async send(phone: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    if (this._destroyed || !this.sock || !this._connected) {
      return { success: false, error: 'Not connected' }
    }

    try {
      const jid = `${phone}@s.whatsapp.net`
      const result = await this.sock.sendMessage(jid, { text })
      this._messagesSent++
      this.touch()
      this.resetIdleTimer()
      return { success: true, id: result?.key?.id ?? undefined }
    } catch (error) {
      console.error(`[Ephemeral:${this.id}] Send failed:`, error)
      return { success: false, error: String(error) }
    }
  }

  // ─── Send Raw (media, etc.) ─────────────────────────────

  async sendRaw(jid: string, content: any): Promise<{ success: boolean; id?: string; error?: string }> {
    if (this._destroyed || !this.sock || !this._connected) {
      return { success: false, error: 'Not connected' }
    }
    try {
      const result = await this.sock.sendMessage(jid, content)
      this._messagesSent++
      this.touch()
      this.resetIdleTimer()
      return { success: true, id: result?.key?.id ?? undefined }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // ─── Message Handler ─────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this._messageHandler = handler
  }

  // ─── Status ──────────────────────────────────────────────

  getStatus(): EphemeralStatus {
    return {
      id: this.id,
      connected: this._connected,
      connecting: this._connecting,
      qrCode: this._qrCode,
      phone: this._phone,
      createdAt: this._createdAt,
      lastActivity: this._lastActivity,
      destroysAt: this._lastActivity
        ? new Date(new Date(this._lastActivity).getTime() + this.config.timeoutMs).toISOString()
        : null,
      messagesReceived: this._messagesReceived,
      messagesSent: this._messagesSent,
      mode: 'ephemeral',
    }
  }

  isConnected(): boolean { return this._connected && !this._destroyed }
  isDestroyed(): boolean { return this._destroyed }

  // ─── Internal ────────────────────────────────────────────

  private touch(): void {
    this._lastActivity = new Date().toISOString()
  }

  private resetIdleTimer(): void {
    if (this._idleTimer) clearTimeout(this._idleTimer)
    this._idleTimer = setTimeout(() => {
      console.log(`[Ephemeral:${this.id}] Idle timeout (${this.config.timeoutMs / 1000}s)`)
      this.destroy()
    }, this.config.timeoutMs)
  }

  private extractText(msg: WAMessage): string | null {
    const m = msg.message as any
    if (!m) return null
    if (m.conversation) return m.conversation
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text
    if (m.imageMessage?.caption) return `[Imagen] ${m.imageMessage.caption}`
    if (m.videoMessage?.caption) return `[Video] ${m.videoMessage.caption}`
    if (m.documentMessage?.fileName) return `[Doc] ${m.documentMessage.fileName}`
    if (m.audioMessage) return '[Nota de voz]'
    if (m.stickerMessage) return '[Sticker]'
    if (m.locationMessage) return '[Ubicación]'
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// EphemeralManager — Pool of ephemeral clients
// ═══════════════════════════════════════════════════════════════

type EphemeralScope = {
  ownerId?: string
  workspaceId?: string
}

class EphemeralManager {
  private clients = new Map<string, EphemeralClient>()
  private _maxClients = 5

  private belongs(client: EphemeralClient, scope?: EphemeralScope): boolean {
    if (!scope) return true
    if (scope.ownerId && client.ownerId !== scope.ownerId) return false
    if (scope.workspaceId && client.workspaceId !== scope.workspaceId) return false
    return true
  }

  /**
   * Create a new ephemeral client
   */
  async create(config?: EphemeralConfig): Promise<EphemeralClient> {
    // Cleanup destroyed clients
    this.cleanup()

    if (this.clients.size >= this._maxClients) {
      // Destroy the oldest idle client
      const oldest = [...this.clients.values()].sort((a, b) =>
        new Date(a.getStatus().createdAt).getTime() - new Date(b.getStatus().createdAt).getTime()
      )[0]
      if (oldest) {
        await oldest.destroy()
        this.clients.delete(oldest.id)
      }
    }

    const client = new EphemeralClient(config)
    this.clients.set(client.id, client)
    return client
  }

  /**
   * Get client by ID
   */
  get(id: string, scope?: EphemeralScope): EphemeralClient | undefined {
    const client = this.clients.get(id)
    if (client?.isDestroyed()) {
      this.clients.delete(id)
      return undefined
    }
    if (client && !this.belongs(client, scope)) return undefined
    return client
  }

  /**
   * List all active clients
   */
  list(scope?: EphemeralScope): EphemeralStatus[] {
    this.cleanup()
    return [...this.clients.values()]
      .filter(client => this.belongs(client, scope))
      .map(c => c.getStatus())
  }

  /**
   * Destroy all clients
   */
  async destroyAll(scope?: EphemeralScope): Promise<void> {
    for (const [id, client] of this.clients) {
      if (!this.belongs(client, scope)) continue
      await client.destroy()
      this.clients.delete(id)
    }
  }

  /**
   * Destroy a specific client
   */
  async destroy(id: string, scope?: EphemeralScope): Promise<boolean> {
    const client = this.clients.get(id)
    if (!client || !this.belongs(client, scope)) return false
    await client.destroy()
    this.clients.delete(id)
    return true
  }

  /**
   * Get the first connected client (for quick sends)
   */
  getConnected(scope?: EphemeralScope): EphemeralClient | undefined {
    this.cleanup()
    for (const client of this.clients.values()) {
      if (client.isConnected() && this.belongs(client, scope)) return client
    }
    return undefined
  }

  /**
   * Send via any connected ephemeral client, or via persistent connection
   */
  async sendAny(phone: string, text: string, persistentSender?: (phone: string, text: string) => Promise<{ success: boolean; id?: string; error?: string }>, scope?: EphemeralScope): Promise<{ success: boolean; id?: string; error?: string; source?: string }> {
    // Try only a session owned by the requested tenant/user.
    const ephemeral = this.getConnected(scope)
    if (ephemeral) {
      const result = await ephemeral.send(phone, text)
      return { ...result, source: `ephemeral:${ephemeral.id}` }
    }

    // Fallback to persistent
    if (persistentSender) {
      const result = await persistentSender(phone, text)
      return { ...result, source: 'persistent' }
    }

    return { success: false, error: 'No connected client available' }
  }

  private cleanup(): void {
    for (const [id, client] of this.clients) {
      if (client.isDestroyed()) {
        this.clients.delete(id)
      }
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────

export const ephemeralManager = new EphemeralManager()
export default ephemeralManager
