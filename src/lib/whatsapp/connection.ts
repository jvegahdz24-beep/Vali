// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Connection Manager (Singleton)
// Baileys-based WhatsApp Web connection for real-time messaging
// Uses dynamic imports to avoid Turbopack bundling issues
// ═══════════════════════════════════════════════════════════════

import pino from 'pino'
import path from 'path'
import fs from 'fs'
import QRCode from 'qrcode'
import { humanizeResponse, getRandomDelay } from '@/lib/ai/humanizer'
import { enqueueMessage } from '@/lib/ai/conversation-middleware'
import { processMessageCore } from '@/lib/ai/message-processor'
import { DbAuthState } from './db-auth-state'
import { detectMedia, downloadAndSaveMedia } from './media-handler'
import { isDuplicateMessage } from './shared-dedup'

// ─── Types ────────────────────────────────────────────────────

type WASocket = import('@whiskeysockets/baileys').WASocket
type WAMessage = import('@whiskeysockets/baileys').WAMessage

interface QRData {
  code: string        // base64 encoded QR image
  timestamp: number   // when it was generated
}

export interface WhatsAppStatus {
  connected: boolean
  connecting: boolean
  qrCode: string | null
  phone: string | null
  lastActivity: string | null
}

type StatusEventCallback = (status: WhatsAppStatus) => void
type QREventCallback = (qr: string) => void
type MessageEventCallback = (data: {
  from: string
  message: string
  pushName?: string
}) => void

// ─── Auth Directory ───────────────────────────────────────────

const AUTH_DIR = path.join(process.cwd(), '.whatsapp-auth')

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
  }
}

// ─── DB Auth State ──────────────────────────────────────────

const _WORKSPACE_ID = 'default'
let dbAuth: DbAuthState | null = null

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
// WhatsAppManager Class
// ═══════════════════════════════════════════════════════════════

class WhatsAppManager {
  private sock: WASocket | null = null
  private qrData: QRData | null = null
  private _connected = false
  private _connecting = false
  private _phone: string | null = null
  private _lastActivity: string | null = null
  private _reconnectAttempts = 0
  private _maxReconnectAttempts = 10

  // FIX P5: Per-phone processing lock to prevent concurrent processing
  // Dedup is now handled by shared-dedup.ts (used by both connection + webhook)
  private _processingLocks = new Map<string, boolean>() // phone -> isProcessing

  // Event listeners (in-memory, polled by frontend)
  private statusListeners: StatusEventCallback[] = []
  private qrListeners: QREventCallback[] = []
  private messageListeners: MessageEventCallback[] = []

  constructor() {
    ensureAuthDir()
  }

  // ─── Processing Lock (FIX P5) ────────────────────────────

  private async acquireProcessingLock(phone: string): Promise<boolean> {
    if (this._processingLocks.get(phone)) {
      console.log(`[WhatsApp] Processing lock held for ${phone}, skipping`)
      return false
    }
    this._processingLocks.set(phone, true)
    return true
  }

  private releaseProcessingLock(phone: string) {
    this._processingLocks.delete(phone)
  }

  // ─── Event Subscription ─────────────────────────────────────

  onStatusChange(cb: StatusEventCallback) {
    this.statusListeners.push(cb)
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb)
    }
  }

  onQR(cb: QREventCallback) {
    this.qrListeners.push(cb)
    return () => {
      this.qrListeners = this.qrListeners.filter((l) => l !== cb)
    }
  }

  onMessage(cb: MessageEventCallback) {
    this.messageListeners.push(cb)
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== cb)
    }
  }

  private emitStatus() {
    const status = this.getStatus()
    for (const cb of this.statusListeners) {
      try { cb(status) } catch { /* ignore */ }
    }
  }

  private emitQR(qr: string) {
    for (const cb of this.qrListeners) {
      try { cb(qr) } catch { /* ignore */ }
    }
  }

  private emitMessage(data: { from: string; message: string; pushName?: string }) {
    for (const cb of this.messageListeners) {
      try { cb(data) } catch { /* ignore */ }
    }
  }

  // ─── Connection Lifecycle ───────────────────────────────────

  async start(): Promise<WhatsAppStatus> {
    // FIX: Detect ghost connections — if _connected but socket is dead, force clean reconnect
    if (this._connected && this.sock && !this.isSocketAlive()) {
      console.warn('[WhatsApp] Ghost detected on start() — forcing clean reconnect')
      this._connected = false
      this._connecting = false
      // Clean up dead socket
      try { (this.sock.ev as any).removeAllListeners() } catch { /* ignore */ }
      this.sock = null
    }

    if (this._connected && this.sock) {
      return this.getStatus()
    }

    if (this._connecting) {
      return this.getStatus()
    }

    this._connecting = true
    this._reconnectAttempts = 0
    this.emitStatus()

    // 🔥 NON-BLOCKING: Launch connection in background, return immediately
    // The frontend polls /api/whatsapp/status to get QR and connection updates
    this._connectBackground().catch((err) => {
      console.error('[WhatsApp] Background connection failed:', err)
      this._connecting = false
      this.emitStatus()
    })

    return this.getStatus() // Returns immediately with { connecting: true }
  }

  private async _connectBackground(): Promise<void> {
    try {
      ensureAuthDir()

      const {
        makeWASocket,
        useMultiFileAuthState,
        fetchLatestBaileysVersion,
        DisconnectReason,
      } = await loadBaileys()

      console.log('[WhatsApp] Baileys loaded, creating socket...')

      // ─── DB Auth: Load credentials from DB → tmpdir ───
      dbAuth = new DbAuthState(_WORKSPACE_ID)
      const authDir = await dbAuth.load()
      console.log('[WhatsApp] Auth dir:', authDir)

      // eslint-disable-next-line react-hooks/rules-of-hooks -- Baileys function, not React
      const { state, saveCreds } = await useMultiFileAuthState(authDir)
      const { version } = await fetchLatestBaileysVersion()

      console.log('[WhatsApp] Baileys version:', version)

      const logger = pino({ level: 'silent' })

      // Baileys v7 expects auth as a flat object { creds, keys }
      const authState = {
        creds: state.creds,
        keys: state.keys,
      }

      this.sock = makeWASocket({
        version,
        auth: authState,
        logger,
        printQRInTerminal: true,
        generateHighQualityLinkPreview: true,
        browser: ['ValiAutoFlow', 'Chrome', '120.0.0'],
        getMessage: async () => undefined as any,
      })

      // ─── Event: Credentials Update ──────────────────────────
      // Wrap saveCreds to also persist to DB after each update
      this.sock.ev.on('creds.update', async () => {
        await saveCreds()
        if (dbAuth) {
          try { await dbAuth.save() } catch (e) { console.error('[DB-AUTH] Save failed:', e) }
        }
      })

      // ─── Event: Connection Update ───────────────────────────
      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update

        console.log('[WhatsApp] STATUS:', connection || update)

        // QR code received — convert raw QR string to base64 PNG
        if (qr) {
          console.log('═══════════════════════════════════════════════')
          console.log('📱 ESCANEA ESTE QR CON WHATSAPP:')
          console.log('═══════════════════════════════════════════════')
          console.log(qr)
          console.log('═══════════════════════════════════════════════')
          try {
            const qrPngDataUrl = await QRCode.toDataURL(qr, {
              width: 300,
              margin: 2,
              color: { dark: '#000000', light: '#ffffff' },
            })
            // Extract base64 part from data:image/png;base64,XXXXX
            const base64Png = qrPngDataUrl.replace(/^data:image\/png;base64,/, '')
            this.qrData = {
              code: base64Png,
              timestamp: Date.now(),
            }
            console.log('[WhatsApp] QR code received and converted to PNG')
            this.emitQR(base64Png)
            this.emitStatus()
          } catch (err) {
            console.error('[WhatsApp] Error converting QR to PNG:', err)
            // Fallback: store raw QR (won't display as image but at least doesn't crash)
            this.qrData = {
              code: qr,
              timestamp: Date.now(),
            }
            this.emitQR(qr)
            this.emitStatus()
          }
        }

        // Connection established
        if (connection === 'open') {
          console.log('═══════════════════════════════════════════════')
          console.log('✅ WHATSAPP CONECTADO')
          console.log('═══════════════════════════════════════════════')
          this._connected = true
          this._connecting = false
          this._reconnectAttempts = 0
          this._lastActivity = new Date().toISOString()
          this.qrData = null

          try {
            if (this.sock?.user?.id) {
              this._phone = this.sock.user.id.split(':')[0]
            }
          } catch {
            this._phone = 'connected'
          }

          console.log('[WhatsApp] Connected! Phone:', this._phone)
          this.emitStatus()
        }

        // Connection closed
        if (connection === 'close') {
          this._connected = false
          this._connecting = false
          this._lastActivity = new Date().toISOString()

          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode

          if (statusCode === DisconnectReason.loggedOut) {
            console.log('[WhatsApp] Logged out, need new QR scan')
            this.qrData = null
            this._phone = null
            this._reconnectAttempts = 0
          } else if (statusCode === DisconnectReason.connectionClosed) {
            console.log('[WhatsApp] Connection closed, reconnecting...')
            this.scheduleReconnect(3000)
          } else if (statusCode === DisconnectReason.connectionLost) {
            console.log('[WhatsApp] Connection lost, reconnecting...')
            this.scheduleReconnect(2000)
          } else {
            console.log('[WhatsApp] Connection closed with code:', statusCode)
            if (statusCode !== DisconnectReason.loggedOut) {
              this.scheduleReconnect(5000)
            }
          }

          this.emitStatus()
        }
      })

      // ─── Event: Messages ────────────────────────────────────
      // MIDDLEWARE: Debounce/batching — agrupa mensajes rápidos del mismo usuario
      // y genera UNA sola respuesta en vez de múltiples
      this.sock.ev.on('messages.upsert', async (m: any) => {
        try {
          const msg = m.messages[0] as WAMessage
          if (!msg) return

          if (msg.key.fromMe) return

          const remoteJid = msg.key.remoteJid || ''
          if (remoteJid.includes('@g.us')) return
          if (remoteJid.includes('@broadcast')) return

          if (m.type !== 'notify') return

          // FIX P5: Dedup check — shared dedup (connection + webhook)
          const messageId = msg.key.id
          if (messageId && isDuplicateMessage(messageId)) return

          const phone = remoteJid.split('@')[0]
          const pushName = msg.pushName || undefined

          // ─── MEDIA DETECTION ──────────────────────────────
          const mediaInfo = detectMedia(msg)
          const text = this.extractMessageText(msg)

          if (!text && !mediaInfo) return

          const displayText = text || `[${mediaInfo?.type || 'media'}]`
          console.log(`[WhatsApp] Message from ${phone}: ${displayText.slice(0, 80)}...${mediaInfo ? ` [MEDIA: ${mediaInfo.type}]` : ''}`)
          this._lastActivity = new Date().toISOString()

          this.emitMessage({ from: phone, message: displayText, pushName })

          // ─── DOWNLOAD MEDIA (non-blocking) ───────────────
          if (mediaInfo && this.sock) {
            downloadAndSaveMedia(this.sock, msg, mediaInfo)
              .then((id) => {
                if (id) console.log(`[WhatsApp] Media downloaded: ${id} (${mediaInfo.type})`)
              })
              .catch((err) => {
                console.warn('[WhatsApp] Media download failed (non-critical):', err)
              })
          }

          // ─── PROCESS TEXT MESSAGE ────────────────────────
          if (text) {
            enqueueMessage(phone, text, pushName)
              .then((consolidatedText) => {
                this.processIncomingMessage(phone, consolidatedText, pushName!, remoteJid, msg.key.id!, { mediaInfo })
                  .catch((err) => {
                    console.error('[WhatsApp] Error processing incoming message:', err)
                  })
              })
              .catch((err) => {
                console.error('[WhatsApp] Error in message batching:', err)
                this.processIncomingMessage(phone, text, pushName!, remoteJid, msg.key.id!, { mediaInfo })
                  .catch((err2) => {
                    console.error('[WhatsApp] Error processing fallback:', err2)
                  })
              })
          } else if (mediaInfo) {
            // Media-only message: still create contact/conversation
            this.processIncomingMessage(phone, displayText, pushName!, remoteJid, msg.key.id!, { mediaInfo, isMediaOnly: true })
              .catch((err) => {
                console.error('[WhatsApp] Error processing media-only message:', err)
              })
          }
        } catch (err) {
          console.error('[WhatsApp] Error processing messages.upsert event:', err)
        }
      })

      console.log('[WhatsApp] Socket created, waiting for QR or connection...')
      // Socket events handle the rest (QR generation, connection, messages)
      // No return needed — events drive the lifecycle

    } catch (error) {
      this._connecting = false
      this._connected = false
      console.error('[WhatsApp] Failed to start:', error)
      this.emitStatus()
      // Don't throw — this runs in background, log and recover
    }
  }

  private scheduleReconnect(delayMs: number) {
    if (this._reconnectAttempts < this._maxReconnectAttempts) {
      this._reconnectAttempts++
      const actualDelay = delayMs * Math.min(this._reconnectAttempts, 3)
      setTimeout(() => {
        if (!this._connected && !this._connecting) {
          this.start().catch((err) => {
            console.error('[WhatsApp] Reconnect failed:', err)
          })
        }
      }, actualDelay)
    }
  }

  async stop(): Promise<boolean> {
    try {
      if (this.sock) {
        ;(this.sock.ev as any).removeAllListeners()
        try {
          await this.sock.logout(undefined)
        } catch {
          // logout may fail if already disconnected
        }
        this.sock = null
      }

      this._connected = false
      this._connecting = false
      this._phone = null
      this.qrData = null
      this._reconnectAttempts = 0
      this._lastActivity = new Date().toISOString()

      // Clear auth directory + DB credentials
      if (dbAuth) {
        try { await dbAuth.clear() } catch { /* ignore */ }
        dbAuth = null
      }
      try {
        if (fs.existsSync(AUTH_DIR)) {
          const files = fs.readdirSync(AUTH_DIR)
          for (const file of files) {
            fs.unlinkSync(path.join(AUTH_DIR, file))
          }
          fs.rmdirSync(AUTH_DIR)
        }
      } catch {
        console.warn('[WhatsApp] Could not clear auth directory')
      }

      ensureAuthDir()
      console.log('[WhatsApp] Disconnected and auth cleared')
      this.emitStatus()
      return true
    } catch (error) {
      console.error('[WhatsApp] Error during stop:', error)
      this._connected = false
      this._connecting = false
      this.sock = null
      this.emitStatus()
      return false
    }
  }

  // ─── Send Message ───────────────────────────────────────────

  async sendMessage(phone: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.sock || !this._connected) {
      return { success: false, error: 'WhatsApp not connected' }
    }

    try {
      const jid = `${phone}@s.whatsapp.net`
      const result = await this.sock.sendMessage(jid, { text })

      this._lastActivity = new Date().toISOString()
      console.log(`[WhatsApp] Message sent to ${phone}, id: ${result?.key?.id}`)

      return {
        success: true,
        id: result?.key?.id ?? undefined,
      }
    } catch (error) {
      console.error(`[WhatsApp] Failed to send message to ${phone}:`, error)
      return {
        success: false,
        error: String(error),
      }
    }
  }

  // ─── Status ─────────────────────────────────────────────────

  getStatus(): WhatsAppStatus {
    let qrCode: string | null = null
    if (this.qrData && Date.now() - this.qrData.timestamp < 60000) {
      qrCode = this.qrData.code
    }

    return {
      connected: this._connected,
      connecting: this._connecting,
      qrCode,
      phone: this._phone,
      lastActivity: this._lastActivity,
    }
  }

  getQR(): string | null {
    if (this.qrData && Date.now() - this.qrData.timestamp < 60000) {
      return this.qrData.code
    }
    return null
  }

  isConnected(): boolean {
    return this._connected
  }

  // FIX: Check if the underlying Baileys socket is actually alive.
  // Prevents "ghost connection" where _connected=true but the socket
  // was closed/lost without triggering connection.update event.
  isSocketAlive(): boolean {
    if (!this._connected || !this.sock) return false
    try {
      // Baileys socket has an `ws` property (WebSocket) that has a `readyState`.
      // 1 = OPEN, 0 = CONNECTING, 2 = CLOSING, 3 = CLOSED
      const ws = (this.sock as any).ws
      if (ws && typeof ws.readyState === 'number') {
        return ws.readyState === 1
      }
      // If we can't check ws.readyState, trust the flag but add a heartbeat check
      const lastAct = this._lastActivity
      if (lastAct) {
        const staleThreshold = 5 * 60 * 1000 // 5 minutes
        return (Date.now() - new Date(lastAct).getTime()) < staleThreshold
      }
      return true
    } catch {
      return false
    }
  }

  // ─── Message Text Extraction ────────────────────────────────

  private extractMessageText(msg: WAMessage): string | null {
    const message = msg.message as any

    if (!message) return null

    if (message.conversation) return message.conversation

    if (message.extendedTextMessage?.text) {
      return message.extendedTextMessage.text
    }

    if (message.imageMessage?.caption) {
      return `[Imagen] ${message.imageMessage.caption}`
    }

    if (message.videoMessage?.caption) {
      return `[Video] ${message.videoMessage.caption}`
    }

    if (message.documentMessage?.fileName) {
      return `[Documento] ${message.documentMessage.fileName}`
    }

    if (message.audioMessage) {
      return '[Nota de voz]'
    }

    if (message.stickerMessage) {
      return '[Sticker]'
    }

    if (message.locationMessage) {
      return '[Ubicación compartida]'
    }

    if (message.contactMessage?.displayName) {
      return `[Contacto] ${message.contactMessage.displayName}`
    }

    return null
  }

  // ─── Send Raw Message (for media) ──────────────────────────

  async sendMessageRaw(jid: string, content: any): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.sock || !this._connected) {
      return { success: false, error: 'WhatsApp not connected' }
    }

    try {
      const result = await this.sock.sendMessage(jid, content)
      this._lastActivity = new Date().toISOString()
      console.log(`[WhatsApp] Raw message sent to ${jid}, id: ${result?.key?.id}`)
      return { success: true, id: result?.key?.id ?? undefined }
    } catch (error) {
      console.error(`[WhatsApp] Failed to send raw message:`, error)
      return { success: false, error: String(error) }
    }
  }

  // ─── Incoming Message Processing ────────────────────────────

  private async processIncomingMessage(
    phone: string,
    text: string,
    pushName: string | undefined,
    remoteJid: string,
    externalId: string,
    extra?: {
      mediaInfo?: any
      isMediaOnly?: boolean
    }
  ): Promise<void> {
    // FIX P5: Acquire per-phone processing lock to prevent race conditions
    const acquired = await this.acquireProcessingLock(phone)
    if (!acquired) return

    const pipelineStart = Date.now()

    try {
      // ── CORE: All DB + AI logic in ONE place ──
      const coreResult = await processMessageCore({
        text,
        phone,
        pushName,
        remoteJid,
        externalId,
        channel: 'whatsapp',
        messageType: extra?.mediaInfo?.type || 'text',
        skipAI: !!extra?.isMediaOnly,
      })

      // ── WHATSAPP-SPECIFIC: Humanize + send via socket ──
      const { aiReplyText } = coreResult
      console.log(`[WhatsApp] Reply generated for ${phone} (${Date.now() - pipelineStart}ms, ${aiReplyText ? aiReplyText.length + ' chars' : 'NULL'})`)

      if (aiReplyText && this.sock && this._connected) {
        const humanizedText = humanizeResponse(aiReplyText)
        const finalText = humanizedText.length > 600
          ? humanizedText.slice(0, 600).replace(/\s+[^.!?]*$/, '')
          : humanizedText



        // Typing indicator
        try { await this.sock.sendPresenceUpdate('composing', remoteJid) } catch { /* ignore */ }
        const delay = getRandomDelay(finalText.length)
        await new Promise(resolve => setTimeout(resolve, delay))
        try { await this.sock.sendPresenceUpdate('paused', remoteJid) } catch { /* ignore */ }

        // Send
        let sentMessageId: string | undefined
        try {
          const sendResult = await this.sock.sendMessage(remoteJid!, { text: finalText })
          sentMessageId = sendResult?.key?.id ?? undefined
          console.log(`[WhatsApp] Reply sent to ${phone} (${finalText.length} chars, ${Date.now() - pipelineStart}ms total)`)
        } catch (sendErr) {
          console.error(`[WhatsApp] Send failed to ${phone}:`, sendErr)
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`[WhatsApp] Pipeline failed for ${phone} after ${Date.now() - pipelineStart}ms:`, errMsg)
    } finally {
      // FIX P5: Always release the processing lock
      this.releaseProcessingLock(phone)
    }
  }
}

// ─── Singleton Instantiation ──────────────────────────────────
// Persist across hot-reloads using globalThis. Only reuse the
// instance if it has an ACTIVE socket (not just a stale _connected flag).
// FIX P2: Use isSocketAlive() to detect ghost connections from hot-reload.

const globalForWhatsApp = globalThis as unknown as {
  whatsAppManager?: WhatsAppManager
}

let whatsAppManager: WhatsAppManager

if (globalForWhatsApp.whatsAppManager?.isSocketAlive()) {
  // Reuse existing instance only if the underlying WebSocket is truly OPEN
  whatsAppManager = globalForWhatsApp.whatsAppManager
  console.log('[WhatsApp] Reusing live instance from hot-reload')
} else {
  // Stale or dead instance — create fresh
  if (globalForWhatsApp.whatsAppManager) {
    console.log('[WhatsApp] Discarding stale instance (socket dead or not connected)')
  }
  whatsAppManager = new WhatsAppManager()
}

if (process.env.NODE_ENV !== 'production') {
  globalForWhatsApp.whatsAppManager = whatsAppManager
}

export { whatsAppManager }
export default whatsAppManager
