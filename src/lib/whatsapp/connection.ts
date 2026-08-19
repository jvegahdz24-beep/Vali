// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Connection Manager (Per-Workspace Registry)
//
// CRITICAL MULTI-TENANT ISOLATION
// ───────────────────────────────────────────────────────────────
// Each workspace gets its OWN WhatsAppManager instance with its OWN
// Baileys socket, auth state, and message handlers. Managers are
// stored in a registry keyed by workspaceId. There is NO shared
// "default" or "global" manager — every operation requires an
// explicit workspaceId so two tenants can NEVER share a session.
//
// Previously, a single global manager bound to whichever workspace
// connected last caused incoming messages from tenant A's phone to
// be processed under tenant B's workspace. That class of bug is
// structurally impossible with this design.
// ═══════════════════════════════════════════════════════════════

import pino from 'pino'
import QRCode from 'qrcode'
import { humanizeResponse, getRandomDelay } from '@/lib/ai/humanizer'
import { googleCalendarLink } from '@/lib/calendar-links'
import { enqueueMessage } from '@/lib/ai/conversation-middleware'
import { processMessageCore } from '@/lib/ai/message-processor'
import { db } from '@/lib/db'
import { DbAuthState } from './db-auth-state'
import { detectMedia, downloadAndSaveMedia, downloadMediaBuffer } from './media-handler'
import { understandMedia } from '@/lib/ai/media-understanding'
import { fetchAvatarDataUri } from '@/lib/whatsapp/avatar'
import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { isDuplicateMessage } from './shared-dedup'

// ─── Types ────────────────────────────────────────────────────

type WASocket = import('@whiskeysockets/baileys').WASocket
type WAMessage = import('@whiskeysockets/baileys').WAMessage

interface QRData {
  code: string
  timestamp: number
}

export interface WhatsAppStatus {
  workspaceId: string
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

// Extrae los datos del ANUNCIO de origen (Click-to-WhatsApp Ads): WhatsApp
// adjunta externalAdReply al contextInfo del primer mensaje del chat cuando
// el cliente llegó desde un anuncio de Facebook/Instagram.
function extractAdContext(msg: WAMessage): { title?: string; body?: string; sourceUrl?: string } | null {
  try {
    const m = (msg.message || {}) as Record<string, any>
    const ctxInfo =
      m.extendedTextMessage?.contextInfo ||
      m.imageMessage?.contextInfo ||
      m.videoMessage?.contextInfo ||
      m.buttonsResponseMessage?.contextInfo ||
      m.templateButtonReplyMessage?.contextInfo
    const ad = ctxInfo?.externalAdReply
    if (!ad) return null
    const title = String(ad.title || '').trim().slice(0, 120) || undefined
    const body = String(ad.body || '').trim().slice(0, 200) || undefined
    const sourceUrl = String(ad.sourceUrl || '').trim().slice(0, 300) || undefined
    if (!title && !body) return null
    return { title, body, sourceUrl }
  } catch { return null }
}

// Divide una respuesta larga en hasta `maxParts` burbujas de WhatsApp de ≤`max`
// chars, cortando por párrafos → líneas (listas ✅) → oraciones → palabras.
// Sustituye al viejo TRUNCADO duro a 600 chars que dejaba pitches a medias
// (el CRM guardaba el texto completo pero el cliente recibía el recorte).
export function splitLongReply(text: string, max = 600, maxParts = 3): string[] {
  const t = (text || '').trim()
  if (t.length <= max) return [t]

  // 1) Unidades atómicas: párrafos; los párrafos gigantes se subdividen.
  const units: string[] = []
  const pushSplit = (s: string) => {
    if (s.length <= max) { units.push(s); return }
    // por líneas (listas con ✅ / viñetas)
    const lines = s.split(/\n/)
    if (lines.length > 1) { for (const l of lines) if (l.trim()) pushSplit(l.trim()); return }
    // por oraciones
    const sentences = s.split(/(?<=[.!?…])\s+/)
    if (sentences.length > 1) {
      let cur = ''
      for (const sen of sentences) {
        if (cur && (cur.length + sen.length + 1) > max) { units.push(cur); cur = sen }
        else cur = cur ? cur + ' ' + sen : sen
      }
      if (cur) units.push(cur)
      return
    }
    // último recurso: por palabras
    let cur = ''
    for (const w of s.split(/\s+/)) {
      if (cur && (cur.length + w.length + 1) > max) { units.push(cur); cur = w }
      else cur = cur ? cur + ' ' + w : w
    }
    if (cur) units.push(cur)
  }
  for (const p of t.split(/\n{2,}/)) if (p.trim()) pushSplit(p.trim())

  // 2) Agrupar unidades en burbujas ≤max (conservando saltos entre párrafos).
  const parts: string[] = []
  let cur = ''
  for (const u of units) {
    const joined = cur ? cur + '\n\n' + u : u
    if (joined.length <= max) cur = joined
    else { if (cur) parts.push(cur); cur = u }
  }
  if (cur) parts.push(cur)

  // 3) Tope de burbujas: si sobra, la última se recorta con cierre limpio.
  if (parts.length > maxParts) {
    const keep = parts.slice(0, maxParts)
    const trimmed = keep[maxParts - 1].replace(/\s+[^.!?…]*$/, '').trim()
    if (trimmed.length > 40) keep[maxParts - 1] = trimmed
    return keep
  }
  return parts
}

// ── NOTA DE VOZ (2026-07-20): si el cliente habla por AUDIO, el bot puede
// responder con VOZ humana (TTS MiniMax → ffmpeg a ogg/opus → push-to-talk).
// Devuelve null si no hay MINIMAX_API_KEY o algo falla (el caller cae a texto).
export async function synthesizeVoiceNote(text: string, voiceId?: string): Promise<Buffer | null> {
  try {
    const { synthesize, ttsAvailable } = await import('@/lib/marketing/tts')
    if (!ttsAvailable()) return null
    const os = await import('os')
    const path = await import('path')
    const fs = await import('fs/promises')
    const { spawn } = await import('child_process')
    const ffmpegStatic = ((await import('ffmpeg-static')).default as unknown as string) || ''
    const bin = ffmpegStatic && await fs.stat(ffmpegStatic).then(() => true).catch(() => false) ? ffmpegStatic : 'ffmpeg'
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const mp3 = path.join(os.tmpdir(), `vf-voice-${stamp}.mp3`)
    const ogg = path.join(os.tmpdir(), `vf-voice-${stamp}.ogg`)
    // Voz por defecto: hombre (el asesor "Jonathan"); configurable con settings.voiceId.
    await synthesize(text.slice(0, 600), voiceId || 'Spanish_SensibleManager', 1, mp3)
    await new Promise<void>((resolve, reject) => {
      const pr = spawn(bin, ['-y', '-i', mp3, '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', ogg], { windowsHide: true })
      pr.on('error', reject)
      pr.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
    })
    const buf = await fs.readFile(ogg)
    void fs.unlink(mp3).catch(() => {})
    void fs.unlink(ogg).catch(() => {})
    return buf.length > 1000 ? buf : null
  } catch (e) {
    console.warn('[VoiceNote] TTS/conversión falló (se cae a texto):', e instanceof Error ? e.message : e)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// WhatsAppManager — One instance per workspace
// ═══════════════════════════════════════════════════════════════

export class WhatsAppManager {
  // Immutable workspace binding — set in constructor, never mutated.
  public readonly workspaceId: string

  private sock: WASocket | null = null
  private dbAuth: DbAuthState
  private qrData: QRData | null = null
  private _connected = false
  private _connecting = false
  private _phone: string | null = null
  private _lastActivity: string | null = null
  private _reconnectAttempts = 0
  // 24/7: queremos mantener la sesión conectada salvo logout explícito. El
  // reconector y el watchdog usan esta bandera para reconectar indefinidamente
  // (nunca se rinde), y NO reconectar cuando el usuario cerró sesión a propósito.
  private _wantConnected = false
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _coldStartAttempted = false
  // Throttle de reconexión: evita que los polls de /api/whatsapp/status (cada
  // 20s, y desde CADA pestaña abierta) disparen reconexiones en ráfaga que
  // interrumpen la reconexión propia de Baileys y nunca dejan estabilizar.
  private _lastConnectAttemptAt = 0
  private static readonly RECONNECT_THROTTLE_MS = 25000

  private _processingLocks = new Map<string, boolean>()
  private _lidToPhone = new Map<string, string>()
  // Contactos cuya foto de perfil ya intentamos traer esta sesión (evita repetir)
  private _avatarChecked = new Set<string>()

  // ─── Per-phone response cooldown ─────────────────────────────
  // Prevents infinite loops: max 3 AI replies per phone per 60 seconds
  private _responseWindow = new Map<string, { count: number; windowStart: number; lastReply: string }>()
  private readonly COOLDOWN_WINDOW_MS = 60_000
  private readonly COOLDOWN_MAX_REPLIES = 3

  private checkResponseCooldown(phone: string, replyText: string): 'ok' | 'cooldown' | 'duplicate' {
    const now = Date.now()
    const entry = this._responseWindow.get(phone)

    if (!entry || now - entry.windowStart >= this.COOLDOWN_WINDOW_MS) {
      // New window
      this._responseWindow.set(phone, { count: 1, windowStart: now, lastReply: replyText })
      return 'ok'
    }

    // Same window: check for duplicate reply (exact same text sent back-to-back)
    if (entry.lastReply === replyText) {
      console.warn(`[WA:${this.workspaceId}] Duplicate reply suppressed for ${phone}: "${replyText.slice(0, 60)}"`)
      return 'duplicate'
    }

    // Cooldown: too many replies in this window
    if (entry.count >= this.COOLDOWN_MAX_REPLIES) {
      console.warn(`[WA:${this.workspaceId}] Cooldown hit for ${phone} (${entry.count} replies in ${this.COOLDOWN_WINDOW_MS / 1000}s) — skipping`)
      return 'cooldown'
    }

    entry.count++
    entry.lastReply = replyText
    return 'ok'
  }

  private statusListeners: StatusEventCallback[] = []
  private qrListeners: QREventCallback[] = []
  private messageListeners: MessageEventCallback[] = []

  constructor(workspaceId: string) {
    if (!workspaceId || workspaceId === 'default') {
      throw new Error(
        `[WhatsApp] Refusing to create manager with invalid workspaceId="${workspaceId}". ` +
        `A valid workspace ID is required to prevent cross-tenant message mixing.`
      )
    }
    this.workspaceId = workspaceId
    this.dbAuth = new DbAuthState(workspaceId)
  }

  // ─── Processing Lock ────────────────────────────────────────

  private async acquireProcessingLock(phone: string): Promise<boolean> {
    if (this._processingLocks.get(phone)) {
      console.log(`[WA:${this.workspaceId}] Processing lock held for ${phone}, skipping`)
      return false
    }
    this._processingLocks.set(phone, true)
    return true
  }

  private releaseProcessingLock(phone: string) {
    this._processingLocks.delete(phone)
  }

  // ─── LID Resolution ─────────────────────────────────────────

  private _loadLidMappings(authDir: string) {
    try {
      const entries = readdirSync(authDir)
      let count = 0
      for (const entry of entries) {
        const reverseMatch = entry.match(/^lid-mapping-(\d+)_reverse\.json$/)
        if (reverseMatch) {
          try {
            const phone = JSON.parse(readFileSync(`${authDir}/${entry}`, 'utf8'))
            if (typeof phone === 'string') {
              this._lidToPhone.set(reverseMatch[1], phone)
              count++
            }
          } catch { /* ignore individual file errors */ }
          continue
        }
        const forwardMatch = entry.match(/^lid-mapping-(\d+)\.json$/)
        if (forwardMatch) {
          try {
            const lid = JSON.parse(readFileSync(`${authDir}/${entry}`, 'utf8'))
            if (typeof lid === 'string') {
              this._lidToPhone.set(lid, forwardMatch[1])
              count++
            }
          } catch { /* ignore */ }
        }
      }
      console.log(`[WA:${this.workspaceId}] Loaded ${count} LID→phone mappings`)
    } catch (e) {
      console.warn(`[WA:${this.workspaceId}] LID mapping load failed:`, e)
    }
  }

  // Resolve the REAL phone number from a message. WhatsApp now addresses many
  // chats by `<lid>@lid` (an internal id, NOT a phone). Baileys 7 attaches the
  // real phone JID as `key.remoteJidAlt` (= `<phone>@s.whatsapp.net`); we use
  // that, cache the mapping, and only fall back to the raw LID as a last resort.
  // Passing the message key is what fixes contacts being saved with a 15-digit
  // LID instead of the phone.
  private _resolvePhone(remoteJid: string, key?: { remoteJidAlt?: string; participantAlt?: string; participantPn?: string }): string {
    if (remoteJid.endsWith('@s.whatsapp.net')) return remoteJid.split('@')[0]
    if (!remoteJid.endsWith('@lid')) return remoteJid.split('@')[0]
    const lid = remoteJid.split('@')[0]
    const alt = key?.remoteJidAlt || key?.participantAlt || key?.participantPn
    if (typeof alt === 'string' && alt) {
      const pn = alt.split('@')[0]
      if (/^\d{8,15}$/.test(pn)) {
        this._lidToPhone.set(lid, pn)
        return pn
      }
    }
    const cached = this._lidToPhone.get(lid)
    if (cached) return cached
    return lid // last resort — no phone available yet
  }

  /** @deprecated use _resolvePhone(remoteJid, msg.key) */
  private _resolveLid(remoteJid: string): string {
    return this._resolvePhone(remoteJid)
  }

  // ─── Event Subscription ─────────────────────────────────────

  onStatusChange(cb: StatusEventCallback) {
    this.statusListeners.push(cb)
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb) }
  }
  onQR(cb: QREventCallback) {
    this.qrListeners.push(cb)
    return () => { this.qrListeners = this.qrListeners.filter(l => l !== cb) }
  }
  onMessage(cb: MessageEventCallback) {
    this.messageListeners.push(cb)
    return () => { this.messageListeners = this.messageListeners.filter(l => l !== cb) }
  }

  private emitStatus() {
    const status = this.getStatus()
    for (const cb of this.statusListeners) { try { cb(status) } catch { /* ignore */ } }
  }
  private emitQR(qr: string) {
    for (const cb of this.qrListeners) { try { cb(qr) } catch { /* ignore */ } }
  }
  private emitMessage(data: { from: string; message: string; pushName?: string }) {
    for (const cb of this.messageListeners) { try { cb(data) } catch { /* ignore */ } }
  }

  // ─── Connection Lifecycle ───────────────────────────────────

  // Cierra de verdad el socket actual (WebSocket incluido) antes de soltarlo.
  // Soltar la referencia sin cerrar dejaba un socket zombi conectado a WhatsApp
  // compartiendo las llaves Signal con el nuevo → corrupción de sesión (Bad MAC)
  // → mensajes que no se pueden descifrar ni entregar.
  private _killSocket(): void {
    const sock = this.sock as any
    this.sock = null
    if (!sock) return
    try { sock.ev?.removeAllListeners?.() } catch { /* ignore */ }
    try { sock.end?.(undefined) } catch { /* ignore */ }
    try { sock.ws?.close?.() } catch { /* ignore */ }
  }

  // Memoria de mensajes ENVIADOS (id → proto) para poder responder los "retry
  // receipts": si el teléfono del destinatario no logra descifrar nuestro
  // mensaje, WhatsApp nos pide re-enviarlo vía getMessage(). Antes getMessage
  // devolvía undefined y el mensaje moría en "Esperando este mensaje".
  private _sentStore = new Map<string, any>()
  private _rememberSent(result: any): void {
    try {
      const id = result?.key?.id
      if (!id || !result?.message) return
      this._sentStore.set(id, result.message)
      if (this._sentStore.size > 2000) {
        const oldest = this._sentStore.keys().next().value
        if (oldest) this._sentStore.delete(oldest)
      }
    } catch { /* ignore */ }
  }

  async start(force = false, resetCounter = true): Promise<WhatsAppStatus> {
    if (this._connected && this.sock && !this.isSocketAlive()) {
      // Socket marcado como conectado pero el WebSocket está muerto. Lo
      // reciclamos, PERO con throttle: si acabamos de intentar reconectar,
      // deja que estabilice en vez de tumbarlo otra vez (esto causaba el
      // parpadeo "desconecta/reconecta" que reportó Jhon).
      if (!force && Date.now() - this._lastConnectAttemptAt < WhatsAppManager.RECONNECT_THROTTLE_MS) {
        return this.getStatus()
      }
      console.warn(`[WA:${this.workspaceId}] Ghost detected — forcing clean reconnect`)
      this._connected = false
      this._connecting = false
      this._killSocket()
    }
    if (this._connected && this.sock) return this.getStatus()
    if (this._connecting && !force) return this.getStatus()
    if (this._connecting && force) {
      console.log(`[WA:${this.workspaceId}] Force-restart: killing current connecting socket`)
      this._killSocket()
      this._connecting = false
      this.qrData = null
    }

    this._connecting = true
    this._wantConnected = true // cualquier arranque = queremos permanecer conectados
    this._lastConnectAttemptAt = Date.now()

    if (resetCounter) this._reconnectAttempts = 0
    this.emitStatus()

    this._connectBackground().catch((err) => {
      console.error(`[WA:${this.workspaceId}] Background connection failed:`, err)
      this._connecting = false
      this.emitStatus()
    })

    return this.getStatus()
  }

  /**
   * Nudge de reconexión THROTTLEADO para health-checks (status poll, cold start).
   * A diferencia de start(), no hace nada si ya está sano, si está conectando, o
   * si hace muy poco que se intentó — así varias pestañas polleando cada 20s no
   * provocan una tormenta de reconexiones. Devuelve el estado actual.
   */
  ensureConnected(): WhatsAppStatus {
    if (this._connecting) return this.getStatus()
    if (this._connected && this.sock && this.isSocketAlive()) return this.getStatus()
    if (Date.now() - this._lastConnectAttemptAt < WhatsAppManager.RECONNECT_THROTTLE_MS) {
      return this.getStatus()
    }
    this.start(false, false).catch((err) => console.error(`[WA:${this.workspaceId}] ensureConnected failed:`, err))
    return this.getStatus()
  }

  private async _connectBackground(): Promise<void> {
    try {
      const {
        makeWASocket,
        useMultiFileAuthState,
        fetchLatestBaileysVersion,
        DisconnectReason,
      } = await loadBaileys()

      console.log(`[WA:${this.workspaceId}] Baileys loaded, creating socket...`)

      // Si quedó un socket anterior, se cierra ANTES de crear el nuevo (nunca
      // dos sockets vivos con las mismas credenciales).
      this._killSocket()

      const authDir = await this.dbAuth.load()
      const fs = await import('fs')
      fs.mkdirSync(authDir, { recursive: true })

      // Load LID → phone mappings from auth files
      this._loadLidMappings(authDir)

      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { state, saveCreds } = await useMultiFileAuthState(authDir)
      const { version } = await fetchLatestBaileysVersion()

      const logger = pino({ level: 'silent' })

      this.sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: state.keys },
        logger,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        browser: ['ValiAutoFlow', 'Chrome', '120.0.0'],
        // La cuenta ya está emparejada desde hace tiempo: re-sincronizar TODO el
        // historial en cada reconexión solo agrega minutos de carga y archivos de
        // sesión. Los mensajes que llegan estando caídos entran igual como
        // 'append' (cola offline), eso no depende del history sync.
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        getMessage: async (key: any) => this._sentStore.get(key?.id) ?? undefined,
      })

      this.sock.ev.on('creds.update', async () => {
        this._lastActivity = new Date().toISOString()
        await saveCreds()
        try { await this.dbAuth.save() } catch (e) { console.error(`[WA:${this.workspaceId}] DB save failed:`, e) }
      })

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update
        console.log(`[WA:${this.workspaceId}] STATUS:`, connection || update)

        if (qr) {
          try {
            const qrPngDataUrl = await QRCode.toDataURL(qr, {
              width: 300, margin: 2,
              color: { dark: '#000000', light: '#ffffff' },
            })
            const base64Png = qrPngDataUrl.replace(/^data:image\/png;base64,/, '')
            this.qrData = { code: base64Png, timestamp: Date.now() }
            this.emitQR(base64Png)
            this.emitStatus()
          } catch (err) {
            console.error(`[WA:${this.workspaceId}] QR conversion failed:`, err)
            this.qrData = { code: qr, timestamp: Date.now() }
            this.emitQR(qr)
            this.emitStatus()
          }
        }

        if (connection === 'open') {
          console.log(`[WA:${this.workspaceId}] ✅ CONNECTED`)
          this._connected = true
          this._connecting = false
          this._reconnectAttempts = 0
          this._lastActivity = new Date().toISOString()
          this.qrData = null

          try {
            if (this.sock?.user?.id) this._phone = this.sock.user.id.split(':')[0]
          } catch { this._phone = 'connected' }

          if (this._phone && this._phone !== 'connected') {
            // Persist connected phone on the workspace + scrub it from any
            // other workspace's settings to avoid stale cross-tenant links.
            try {
              const { db: prismaDb } = await import('@/lib/db')
              const ws = await prismaDb.workspace.findUnique({
                where: { id: this.workspaceId },
                select: { settings: true },
              })
              if (ws) {
                let s: Record<string, unknown> = {}
                try { s = JSON.parse(ws.settings || '{}') } catch { s = {} }
                s.connectedPhone = this._phone
                await prismaDb.workspace.update({
                  where: { id: this.workspaceId },
                  data: { settings: JSON.stringify(s) },
                })
                console.log(`[WA:${this.workspaceId}] connectedPhone="${this._phone}" saved`)
              }
              const others = await prismaDb.workspace.findMany({
                where: { id: { not: this.workspaceId } },
                select: { id: true, settings: true },
              })
              for (const w of others) {
                let ws2: Record<string, unknown> = {}
                try { ws2 = JSON.parse(w.settings || '{}') } catch { ws2 = {} }
                if (ws2.connectedPhone === this._phone) {
                  delete ws2.connectedPhone
                  await prismaDb.workspace.update({
                    where: { id: w.id },
                    data: { settings: JSON.stringify(ws2) },
                  })
                  console.warn(`[WA:${this.workspaceId}] Scrubbed duplicate connectedPhone="${this._phone}" from workspace ${w.id}`)
                }
              }
            } catch (err) {
              console.warn(`[WA:${this.workspaceId}] persist connectedPhone failed:`, err)
            }
          }

          this.emitStatus()
        }

        if (connection === 'close') {
          this._connected = false
          this._connecting = false
          this._lastActivity = new Date().toISOString()
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode

          if (statusCode === DisconnectReason.loggedOut) {
            // Logout REAL (401): la sesión ya no sirve; limpiamos y NO reconectamos.
            console.log(`[WA:${this.workspaceId}] Logged out, clearing auth`)
            this._wantConnected = false
            this.qrData = null
            this._phone = null
            this._reconnectAttempts = 0
            if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
            this.dbAuth.clear().catch((e) => console.warn(`[WA:${this.workspaceId}] Clear auth failed:`, e))
          } else if (this._reconnectAttempts >= 8) {
            // La sesión NO responde tras muchos intentos (varios minutos) y WhatsApp
            // no devolvió un logout formal (401). Suele ser sesión muerta / dispositivo
            // desvinculado que no reporta loggedOut → el manager reintentaba PARA
            // SIEMPRE y NUNCA mostraba QR (reporte de Jhon 2026-07-24: "se queda
            // cargando"). Fix: limpiar credenciales y arrancar de cero → emite QR nuevo.
            console.warn(`[WA:${this.workspaceId}] ${this._reconnectAttempts} reconexiones fallidas — limpiando sesión y mostrando QR nuevo`)
            this._phone = null
            this.qrData = null
            this._reconnectAttempts = 0
            if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
            await this.dbAuth.clear().catch((e) => console.warn(`[WA:${this.workspaceId}] Clear auth failed:`, e))
            this._killSocket()
            this.scheduleReconnect(2000) // sin credenciales, el próximo arranque emite QR
          } else {
            // CUALQUIER otro cierre (connectionClosed/Lost/timedOut/restartRequired/
            // conflict/…) es RECUPERABLE → reconectar. Nunca nos rendimos: es lo que
            // mantiene la sesión viva 24/7 (con tope arriba para no loopear sin QR).
            console.log(`[WA:${this.workspaceId}] Closed (recuperable) code:`, statusCode, '— reconectando')
            this.scheduleReconnect(3000)
          }

          this.emitStatus()
        }
      })

      this.sock.ev.on('messages.upsert', async (m: any) => {
        // ⚠️ FIX PÉRDIDA DE MENSAJES EN RECONEXIÓN (reporte de Jhon 2026-07-13):
        // 1) Antes solo se procesaba m.messages[0] — al reconectar, WhatsApp
        //    entrega los mensajes acumulados EN LOTE y todo lo demás se perdía.
        // 2) Antes se descartaba todo lo que no fuera type 'notify' — los
        //    mensajes offline llegan como 'append' al reconectar y se tiraban.
        // Ahora: se procesan TODOS los del lote (notify y append), con guardia
        // de frescura de 24h para no revivir históricos de un resync.
        if (m.type !== 'notify' && m.type !== 'append') return
        const upsertType = String(m.type)
        for (const msg of (m.messages || []) as WAMessage[]) {
        try {
          if (!msg) continue
          if (msg.key.fromMe) continue

          const remoteJid = msg.key.remoteJid || ''
          if (remoteJid.includes('@g.us')) continue
          if (remoteJid.includes('@broadcast')) continue

          // Frescura: los 'append' (cola offline) solo se aceptan si tienen
          // menos de 24h — evita procesar históricos en un resync de sesión.
          if (upsertType === 'append') {
            const ts = Number((msg as any).messageTimestamp || 0) * 1000
            if (!ts || Date.now() - ts > 24 * 60 * 60 * 1000) continue
            console.log(`[WA:${this.workspaceId}] 📬 Mensaje OFFLINE recuperado (llegó durante la reconexión)`)
          }

          const messageId = msg.key.id
          if (messageId && isDuplicateMessage(messageId)) continue

          const phone = this._resolvePhone(remoteJid, msg.key as any)
          const pushName = msg.pushName || undefined

          // Chats nacidos de un anuncio de Facebook/Instagram (CTWA): WhatsApp
          // adjunta los datos del anuncio al primer mensaje. Se pasan al core
          // para que el bot abra con ese contexto real.
          const adCtx = extractAdContext(msg)

          const mediaInfo = detectMedia(msg)
          const text = this.extractMessageText(msg)
          if (!text && !mediaInfo) continue

          // ── Comprensión multimodal: el bot ESCUCHA audios, VE imágenes y LEE
          // documentos. Descarga el media y lo convierte a texto que entiende.
          let understood: string | null = null
          if (mediaInfo && this.sock && ['audio', 'image', 'sticker', 'document'].includes(mediaInfo.type)) {
            try {
              const buf = await downloadMediaBuffer(this.sock, msg)
              if (buf) {
                // Keys de transcripción/visión que el cliente configuró (settings.apiKeys), con fallback a env.
                let mediaKeys: { groq?: string; openai?: string } = {}
                try {
                  const ws = await db.workspace.findUnique({ where: { id: this.workspaceId }, select: { settings: true } })
                  const ak = JSON.parse(ws?.settings || '{}').apiKeys || {}
                  mediaKeys = { groq: ak.groq, openai: ak.openai }
                } catch { /* usa env */ }
                understood = await understandMedia(buf, mediaInfo, mediaKeys)
              }
            } catch (err) {
              console.warn(`[WA:${this.workspaceId}] Media understanding failed:`, err)
            }
          }

          const effectiveText = [text, understood].filter(Boolean).join('\n').trim()
          const displayText = text || (understood ? understood.slice(0, 80) : `[${mediaInfo?.type || 'media'}]`)
          console.log(`[WA:${this.workspaceId}] Msg from ${phone}: ${displayText.slice(0, 80)}`)
          this._lastActivity = new Date().toISOString()

          this.emitMessage({ from: phone, message: displayText, pushName })

          if (mediaInfo && this.sock) {
            downloadAndSaveMedia(this.sock, msg, mediaInfo, { workspaceId: this.workspaceId, waMsgKey: msg.key.id || undefined }).catch((err) => {
              console.warn(`[WA:${this.workspaceId}] Media download failed:`, err)
            })
          }

          if (effectiveText) {
            enqueueMessage(phone, effectiveText, pushName)
              .then((consolidatedText) => {
                this.processIncomingMessage(phone, consolidatedText, pushName!, remoteJid, msg.key.id!, { mediaInfo, adContext: adCtx })
                  .catch((err) => console.error(`[WA:${this.workspaceId}] Process error:`, err))
              })
              .catch((err) => {
                console.error(`[WA:${this.workspaceId}] Batch error:`, err)
                this.processIncomingMessage(phone, effectiveText, pushName!, remoteJid, msg.key.id!, { mediaInfo, adContext: adCtx })
                  .catch((err2) => console.error(`[WA:${this.workspaceId}] Fallback error:`, err2))
              })
          } else if (mediaInfo) {
            // No se pudo entender el media (sin proveedor de voz/visión) → ruta
            // media-only: el bot pide el texto amablemente.
            this.processIncomingMessage(phone, `[${mediaInfo.type}]`, pushName!, remoteJid, msg.key.id!, { mediaInfo, isMediaOnly: true, adContext: adCtx })
              .catch((err) => console.error(`[WA:${this.workspaceId}] Media-only error:`, err))
          }
        } catch (err) {
          console.error(`[WA:${this.workspaceId}] messages.upsert item error:`, err)
        }
        } // fin del for — cada mensaje del lote se procesa aunque otro falle
      })

      this.sock.ev.on('messaging-history.set', async (history: any) => {
        try {
          const historyMessages = (history.messages || []) as WAMessage[]
          if (Array.isArray(history.lidPnMappings)) {
            for (const mapping of history.lidPnMappings) {
              if (mapping?.lid && mapping?.pn) {
                this._lidToPhone.set(String(mapping.lid).split('@')[0], String(mapping.pn).split('@')[0])
              }
            }
          }
          if (historyMessages.length === 0) return

          let persisted = 0
          for (const msg of historyMessages) {
            if (await this.persistSyncedMessage(msg)) persisted++
          }
          console.log(
            `[WA:${this.workspaceId}] History sync persisted ${persisted}/${historyMessages.length} messages ` +
            `(syncType=${history.syncType ?? 'unknown'}, progress=${history.progress ?? 'n/a'})`
          )
        } catch (err) {
          console.error(`[WA:${this.workspaceId}] messaging-history.set error:`, err)
        }
      })

      console.log(`[WA:${this.workspaceId}] Socket created, waiting for QR or connection...`)
    } catch (error) {
      this._connecting = false
      this._connected = false
      if (this.sock) {
        try { (this.sock.ev as any).removeAllListeners() } catch { /* ignore */ }
        this.sock = null
      }
      console.error(`[WA:${this.workspaceId}] Failed to start:`, error)
      this.emitStatus()
    }
  }

  private scheduleReconnect(delayMs: number) {
    // 24/7: NO nos rendimos nunca (antes paraba tras 10 intentos y quedaba
    // muerto para siempre). Reconexión infinita con backoff exponencial suave
    // topado a 60s. Un solo timer pendiente a la vez (evita ráfagas).
    if (!this._wantConnected) return
    if (this._reconnectTimer) return
    this._reconnectAttempts++
    const base = Math.max(delayMs, 2000)
    const backoff = Math.min(base * Math.min(this._reconnectAttempts, 12), 60000)
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      if (this._wantConnected && !this._connected && !this._connecting) {
        // resetCounter=false para que el backoff siga creciendo si sigue fallando
        this.start(false, false).catch((err) => console.error(`[WA:${this.workspaceId}] Reconnect failed:`, err))
      }
    }, backoff)
  }

  /** Estado para el watchdog: ¿queremos estar conectados pero no lo estamos? */
  wantsConnection(): boolean { return this._wantConnected }
  isHealthy(): boolean { return this._connected && !!this.sock && this.isSocketAlive() }

  async stop(): Promise<boolean> {
    try {
      this._wantConnected = false // logout explícito → el watchdog no debe revivirlo
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
      if (this.sock) {
        ;(this.sock.ev as any).removeAllListeners()
        try { await this.sock.logout(undefined) } catch { /* ignore */ }
        this.sock = null
      }
      this._connected = false
      this._connecting = false
      this._phone = null
      this.qrData = null
      this._reconnectAttempts = 0
      this._lastActivity = new Date().toISOString()

      try { await this.dbAuth.clear() } catch { /* ignore */ }

      try {
        const { db: prismaDb } = await import('@/lib/db')
        const ws = await prismaDb.workspace.findUnique({
          where: { id: this.workspaceId },
          select: { settings: true },
        })
        if (ws) {
          let s: Record<string, unknown> = {}
          try { s = JSON.parse(ws.settings || '{}') } catch { s = {} }
          if (s.connectedPhone) {
            delete s.connectedPhone
            await prismaDb.workspace.update({
              where: { id: this.workspaceId },
              data: { settings: JSON.stringify(s) },
            })
          }
        }
      } catch { /* non-critical */ }

      console.log(`[WA:${this.workspaceId}] Disconnected and auth cleared`)
      this.emitStatus()
      return true
    } catch (error) {
      console.error(`[WA:${this.workspaceId}] Stop error:`, error)
      this._connected = false
      this._connecting = false
      this.sock = null
      this.emitStatus()
      return false
    }
  }

  // ─── Send ───────────────────────────────────────────────────

  async sendMessage(phone: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.sock || !this._connected) return { success: false, error: 'WhatsApp not connected' }
    try {
      const jid = `${phone}@s.whatsapp.net`
      const result = await this.sock.sendMessage(jid, { text })
      this._rememberSent(result)
      this._lastActivity = new Date().toISOString()
      console.log(`[WA:${this.workspaceId}] Sent to ${phone}, id: ${result?.key?.id}`)
      return { success: true, id: result?.key?.id ?? undefined }
    } catch (error) {
      console.error(`[WA:${this.workspaceId}] Send failed to ${phone}:`, error)
      return { success: false, error: String(error) }
    }
  }

  async sendMessageRaw(jid: string, content: any): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.sock || !this._connected) return { success: false, error: 'WhatsApp not connected' }
    try {
      const result = await this.sock.sendMessage(jid, content)
      this._rememberSent(result)
      this._lastActivity = new Date().toISOString()
      return { success: true, id: result?.key?.id ?? undefined }
    } catch (error) {
      console.error(`[WA:${this.workspaceId}] Raw send failed:`, error)
      return { success: false, error: String(error) }
    }
  }

  // Publica un creativo (imagen) al ESTADO de WhatsApp (F7, 2026-07-22).
  // Baileys postea a 'status@broadcast'; `statusJidList` son los contactos que lo
  // verán. Todo en try/catch — nunca rompe el socket de atención.
  async sendStatus(imageUrl: string, caption: string, recipientJids: string[]): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.sock || !this._connected) return { success: false, error: 'WhatsApp no conectado' }
    if (!recipientJids.length) return { success: false, error: 'No hay contactos para mostrar el estado' }
    try {
      const res = await fetch(imageUrl)
      if (!res.ok) return { success: false, error: `No pude cargar la imagen (${res.status})` }
      const buf = Buffer.from(await res.arrayBuffer())
      const result = await this.sock.sendMessage(
        'status@broadcast',
        { image: buf, caption: caption || undefined },
        { backgroundColor: '#0a0e14', statusJidList: recipientJids.slice(0, 500), broadcast: true },
      )
      this._lastActivity = new Date().toISOString()
      console.log(`[WA:${this.workspaceId}] Estado publicado (${recipientJids.length} destinatarios), id: ${result?.key?.id}`)
      return { success: true, id: result?.key?.id ?? undefined }
    } catch (error) {
      console.error(`[WA:${this.workspaceId}] sendStatus falló:`, error)
      return { success: false, error: String(error) }
    }
  }

  // ─── Status ─────────────────────────────────────────────────

  getStatus(): WhatsAppStatus {
    let qrCode: string | null = null
    if (this.qrData && Date.now() - this.qrData.timestamp < 60000) qrCode = this.qrData.code
    return {
      workspaceId: this.workspaceId,
      connected: this._connected,
      connecting: this._connecting,
      qrCode,
      phone: this._phone,
      lastActivity: this._lastActivity,
    }
  }

  getQR(): string | null {
    if (this.qrData && Date.now() - this.qrData.timestamp < 60000) return this.qrData.code
    return null
  }

  isConnected(): boolean { return this._connected }

  isSocketAlive(): boolean {
    if (!this._connected || !this.sock) return false
    try {
      const ws = (this.sock as any).ws
      if (ws) {
        // Baileys 7: sock.ws es un WebSocketClient con getter isOpen (readyState
        // vive en ws.socket). Antes solo se miraba ws.readyState (undefined) y se
        // caía al fallback de actividad → tras 5 min sin mensajes el poll creía
        // muerto un socket sano, lo "reciclaba" SIN cerrarlo y quedaban dos
        // sockets vivos con las mismas llaves ⇒ Bad MAC ⇒ mensajes perdidos.
        if (typeof ws.isOpen === 'boolean') return ws.isOpen
        if (typeof ws.readyState === 'number') return ws.readyState === 1
        const raw = ws.socket
        if (raw && typeof raw.readyState === 'number') return raw.readyState === 1
      }
      const lastAct = this._lastActivity
      if (lastAct) return (Date.now() - new Date(lastAct).getTime()) < 5 * 60 * 1000
      return true
    } catch { return false }
  }

  triggerColdStartConnect() {
    if (this._coldStartAttempted) return
    this._coldStartAttempted = true
    console.log(`[WA:${this.workspaceId}] Cold-start triggered`)
    this.start().catch((err) => {
      console.error(`[WA:${this.workspaceId}] Cold-start failed:`, err)
      this._coldStartAttempted = false
    })
  }

  // ─── Helpers ────────────────────────────────────────────────

  private extractMessageText(msg: WAMessage): string | null {
    const message = msg.message as any
    if (!message) return null
    if (message.conversation) return message.conversation
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
    if (message.imageMessage?.caption) return `[Imagen] ${message.imageMessage.caption}`
    if (message.videoMessage?.caption) return `[Video] ${message.videoMessage.caption}`
    if (message.documentMessage?.fileName) return `[Documento] ${message.documentMessage.fileName}`
    if (message.audioMessage) return '[Nota de voz]'
    if (message.stickerMessage) return '[Sticker]'
    if (message.locationMessage) return '[Ubicación compartida]'
    if (message.contactMessage?.displayName) return `[Contacto] ${message.contactMessage.displayName}`
    return null
  }

  private getMessageDate(msg: WAMessage): Date {
    const raw = (msg as any).messageTimestamp
    let seconds = 0
    if (typeof raw === 'number') {
      seconds = raw
    } else if (typeof raw === 'bigint') {
      seconds = Number(raw)
    } else if (raw && typeof raw.toNumber === 'function') {
      seconds = raw.toNumber()
    } else if (raw && typeof raw.low === 'number') {
      seconds = raw.low
    }

    if (!Number.isFinite(seconds) || seconds <= 0) return new Date()
    return new Date(seconds > 1_000_000_000_000 ? seconds : seconds * 1000)
  }

  private async persistSyncedMessage(msg: WAMessage): Promise<boolean> {
    const remoteJid = msg.key.remoteJid || ''
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) return false

    const phone = this._resolvePhone(remoteJid, msg.key as any)
    if (!phone) return false

    const externalId = msg.key.id || undefined
    const mediaInfo = detectMedia(msg)
    const text = this.extractMessageText(msg)
    if (!text && !mediaInfo) return false

    const createdAt = this.getMessageDate(msg)
    const content = text || `[${mediaInfo?.type || 'media'}]`
    const direction = msg.key.fromMe ? 'outbound' : 'inbound'
    const senderType = msg.key.fromMe ? 'human' : 'contact'

    let contact = await db.contact.findUnique({
      where: {
        contact_workspace_phone_key: {
          workspaceId: this.workspaceId,
          phone,
        },
      },
    })

    if (!contact) {
      contact = await db.contact.create({
        data: {
          workspaceId: this.workspaceId,
          firstName: msg.pushName || phone || 'Contacto WhatsApp',
          phone,
          source: 'whatsapp',
          tags: JSON.stringify(['whatsapp_history_sync']),
          lastMessageAt: createdAt,
        },
      })
    } else if (!contact.lastMessageAt || createdAt > contact.lastMessageAt) {
      contact = await db.contact.update({
        where: { id: contact.id },
        data: {
          lastMessageAt: createdAt,
          status: 'active',
          ...(msg.pushName && msg.pushName.length >= 2 && contact.firstName === 'Contacto WhatsApp'
            ? { firstName: msg.pushName }
            : {}),
        },
      })
    }

    let conversation = await db.conversation.findFirst({
      where: {
        workspaceId: this.workspaceId,
        contactId: contact.id,
        channel: 'whatsapp',
        status: 'active',
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          workspaceId: this.workspaceId,
          contactId: contact.id,
          channel: 'whatsapp',
          status: 'active',
          externalId: remoteJid,
          lastMessageAt: createdAt,
          lastMessagePreview: content.slice(0, 100),
          metadata: JSON.stringify({ remoteJid, historySynced: true }),
        },
      })
    }

    if (externalId) {
      const existing = await db.message.findFirst({
        where: { conversationId: conversation.id, externalId },
        select: { id: true },
      })
      if (existing) return false
    }

    if (msg.key.fromMe) {
      const duplicateWindowMs = 2 * 60 * 1000
      const nearDuplicate = await db.message.findFirst({
        where: {
          conversationId: conversation.id,
          content,
          direction,
          externalId: null,
          createdAt: {
            gte: new Date(createdAt.getTime() - duplicateWindowMs),
            lte: new Date(createdAt.getTime() + duplicateWindowMs),
          },
        },
        select: { id: true },
      })
      if (nearDuplicate) return false
    }

    const savedMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        content,
        type: mediaInfo?.type || 'text',
        direction,
        senderType,
        externalId,
        status: msg.key.fromMe ? 'sent' : 'delivered',
        metadata: JSON.stringify({ remoteJid, historySynced: true }),
        createdAt,
      },
    })

    if (!conversation.lastMessageAt || createdAt >= conversation.lastMessageAt) {
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: createdAt,
          lastMessagePreview: content.slice(0, 100),
        },
      })
    }

    if (mediaInfo && this.sock) {
      await downloadAndSaveMedia(this.sock, msg, mediaInfo, {
        workspaceId: this.workspaceId,
        conversationId: conversation.id,
        messageId: savedMessage.id,
      }).catch((err) => {
        console.warn(`[WA:${this.workspaceId}] History media save failed:`, err)
        return null
      })
    }

    return true
  }

  // ─── Foto de perfil de WhatsApp → contact.avatar ──────────────
  // Aislado y defensivo: nunca lanza, nunca bloquea el flujo de mensajes.
  private async maybeFetchAvatar(phone: string, remoteJid: string): Promise<void> {
    try {
      if (!this.sock || !this._connected || !phone) return
      if (this._avatarChecked.has(phone)) return
      this._avatarChecked.add(phone)
      const contact = await db.contact.findUnique({
        where: { contact_workspace_phone_key: { workspaceId: this.workspaceId, phone } },
        select: { id: true, avatar: true },
      })
      if (!contact || contact.avatar) return
      let url: string | undefined
      try { url = await this.sock.profilePictureUrl(remoteJid, 'image') } catch { url = undefined }
      if (!url) return
      const dataUri = await fetchAvatarDataUri(url)
      if (!dataUri) return
      await db.contact.update({ where: { id: contact.id }, data: { avatar: dataUri } }).catch(() => {})
    } catch { /* nunca bloquear el flujo del bot */ }
  }

  /**
   * Rellena las fotos de perfil de los contactos existentes que aún no tienen.
   * Se puede invocar desde un endpoint con el manager activo del workspace.
   */
  async backfillAvatars(limit = 200): Promise<{ scanned: number; updated: number }> {
    let updated = 0
    if (!this.sock || !this._connected) return { scanned: 0, updated }
    const contacts = await db.contact.findMany({
      where: { workspaceId: this.workspaceId, source: 'whatsapp', avatar: null, phone: { not: null } },
      select: { id: true, phone: true },
      take: limit,
    })
    for (const c of contacts) {
      if (!c.phone) continue
      const jid = `${c.phone}@s.whatsapp.net`
      let url: string | undefined
      try { url = await this.sock.profilePictureUrl(jid, 'image') } catch { url = undefined }
      this._avatarChecked.add(c.phone)
      if (!url) continue
      const dataUri = await fetchAvatarDataUri(url)
      if (!dataUri) continue
      await db.contact.update({ where: { id: c.id }, data: { avatar: dataUri } }).catch(() => {})
      updated++
      await new Promise((r) => setTimeout(r, 150)) // suave, evita rate-limit
    }
    return { scanned: contacts.length, updated }
  }

  private async processIncomingMessage(
    phone: string,
    text: string,
    pushName: string | undefined,
    remoteJid: string,
    externalId: string,
    extra?: { mediaInfo?: any; isMediaOnly?: boolean; adContext?: { title?: string; body?: string; sourceUrl?: string } | null }
  ): Promise<void> {
    const acquired = await this.acquireProcessingLock(phone)
    if (!acquired) return

    const pipelineStart = Date.now()
    try {
      // CRITICAL: workspaceId is ALWAYS this manager's workspaceId.
      // No fallback, no auto-detect — this guarantees the message stays
      // within its tenant boundary.
      const coreResult = await processMessageCore({
        text, phone, pushName, remoteJid, externalId,
        channel: 'whatsapp',
        messageType: extra?.mediaInfo?.type || 'text',
        skipAI: !!extra?.isMediaOnly,
        workspaceId: this.workspaceId,
        adContext: extra?.adContext || undefined,
      })

      const { aiReplyText } = coreResult
      console.log(`[WA:${this.workspaceId}] Reply for ${phone} (${Date.now() - pipelineStart}ms, ${aiReplyText?.length || 0} chars)`)

      // Trae la foto de perfil de WhatsApp (aislado, nunca bloquea la respuesta)
      void this.maybeFetchAvatar(phone, remoteJid)

      if (aiReplyText && this.sock && this._connected) {
        const humanizedText = humanizeResponse(aiReplyText)
        // Respuestas largas YA NO se truncan (antes: corte duro a 600 chars —
        // el cliente recibía el pitch del programa piloto cortado a media lista
        // mientras el CRM mostraba el texto completo; caso Antonio 2026-07-20).
        // Se envían como 2-3 burbujas consecutivas, como escribe un humano.
        const parts = splitLongReply(humanizedText)

        // ── Cooldown guard: prevent infinite loops ────────────────
        const cooldownResult = this.checkResponseCooldown(phone, humanizedText)
        if (cooldownResult !== 'ok') {
          console.warn(`[WA:${this.workspaceId}] Reply blocked (${cooldownResult}) for ${phone}`)
        } else {
          try { await this.sock.sendPresenceUpdate('composing', remoteJid) } catch { /* ignore */ }
          await new Promise(resolve => setTimeout(resolve, getRandomDelay(parts[0].length)))
          try { await this.sock.sendPresenceUpdate('paused', remoteJid) } catch { /* ignore */ }

          try {
            // ── RESPUESTA CON VOZ (2026-07-20): si el cliente mandó NOTA DE
            // VOZ, el bot contesta hablando (misma voz del asesor). El texto se
            // guarda igual en el CRM; si el TTS falla, cae a texto sin drama.
            // Se desactiva por workspace con settings.voiceReplies = false.
            let voiceSent = false
            if (extra?.mediaInfo?.type === 'audio') {
              try {
                const wsRow = await db.workspace.findUnique({ where: { id: this.workspaceId }, select: { settings: true } })
                const sset = (() => { try { return JSON.parse(wsRow?.settings || '{}') } catch { return {} } })() as Record<string, unknown>
                if (sset.voiceReplies !== false) {
                  const spoken = parts[0]
                  const buf = await synthesizeVoiceNote(spoken, typeof sset.voiceId === 'string' ? sset.voiceId : undefined)
                  if (buf && this.sock) {
                    try { await this.sock.sendPresenceUpdate('recording', remoteJid) } catch { /* ignore */ }
                    await new Promise(resolve => setTimeout(resolve, 1200 + Math.min(4000, spoken.length * 12)))
                    const sentV = await this.sock.sendMessage(remoteJid!, { audio: buf, ptt: true, mimetype: 'audio/ogg; codecs=opus' })
                    this._rememberSent(sentV)
                    voiceSent = true
                    console.log(`[WA:${this.workspaceId}] 🎙️ Respuesta de VOZ enviada a ${phone} (${spoken.length} chars hablados)`)
                  }
                }
              } catch (vErr) {
                console.warn(`[WA:${this.workspaceId}] Voz falló, caigo a texto:`, vErr instanceof Error ? vErr.message : vErr)
              }
            }
            const textParts = voiceSent ? parts.slice(1) : parts
            for (let i = 0; i < textParts.length; i++) {
              if (i > 0 || voiceSent) {
                // pausa corta "escribiendo…" entre burbujas — ritmo humano
                try { await this.sock.sendPresenceUpdate('composing', remoteJid) } catch { /* ignore */ }
                await new Promise(resolve => setTimeout(resolve, 1100 + Math.floor(Math.random() * 1300)))
                try { await this.sock.sendPresenceUpdate('paused', remoteJid) } catch { /* ignore */ }
              }
              const sent = await this.sock.sendMessage(remoteJid!, { text: textParts[i] })
              this._rememberSent(sent)
            }
            console.log(`[WA:${this.workspaceId}] Reply sent to ${phone} (${humanizedText.length} chars en ${voiceSent ? '1 nota de voz + ' : ''}${textParts.length} burbuja(s))`)
          } catch (sendErr) {
            console.error(`[WA:${this.workspaceId}] Send failed:`, sendErr)
          }
        }
      }

      // ── If an appointment was just confirmed, send an "add to calendar"
      //    link as a SEPARATE message (avoids the 600-char reply truncation). ──
      const booked = coreResult.appointmentBooked
      if (booked && this.sock && this._connected) {
        try {
          // Anti-repetición: si ya se mandó un link de calendario en esta
          // conversación en las últimas 6h, NO repetir (antes se reenviaba en
          // cada turno que confirmaba la cita → salía 3+ veces). Reporte de Jhon.
          const alreadyLink = await db.message.findFirst({
            where: { conversationId: coreResult.conversationId, direction: 'outbound', content: { contains: 'calendar.google.com' }, createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
            select: { id: true },
          }).catch(() => null)
          if (!alreadyLink) {
            const link = googleCalendarLink({
              title: booked.title,
              start: new Date(booked.date),
              durationMin: booked.durationMin,
              details: 'La llamada será por WhatsApp a la hora acordada. Te contactaremos aquí mismo.',
            })
            await new Promise(resolve => setTimeout(resolve, 1200))
            const calText = `📅 Agrega la cita a tu calendario (la llamada será por WhatsApp):\n${link}`
            this._rememberSent(await this.sock.sendMessage(remoteJid!, { text: calText }))
            // Guardar en el CRM (antes estos mensajes post-core no se persistían → no salían en Conversaciones).
            await db.message.create({ data: { conversationId: coreResult.conversationId, content: calText, type: 'text', direction: 'outbound', senderType: 'agent', status: 'sent', isAiGenerated: true, metadata: JSON.stringify({ source: 'calendar-link' }) } }).catch(() => {})
            console.log(`[WA:${this.workspaceId}] Calendar link sent to ${phone}`)
          } else {
            console.log(`[WA:${this.workspaceId}] Calendar link OMITIDO (ya enviado en esta conversación) a ${phone}`)
          }
        } catch (calErr) {
          console.warn(`[WA:${this.workspaceId}] Calendar link send failed:`, calErr)
        }
      }

      // ── Si el bot pidió enviar media del auto (del inventario): manda TODAS
      // las fotos (hasta 5) + el video si existe, para enganchar al lead ──
      const media = coreResult.mediaToSend
      if (media && this.sock && this._connected) {
        // Resuelve la fuente de la imagen para Baileys: URL absoluta tal cual;
        // archivo local en public/; o ruta relativa → URL ABSOLUTA (https) para
        // que Baileys la descargue (antes una ruta relativa no cargaba y no se
        // enviaba ninguna foto del inventario). Reporte de Jhon.
        const mediaBase = (process.env.NEXT_PUBLIC_APP_URL || 'https://valiautoflow.com').replace(/\/$/, '')
        const resolveSrc = (u: string) => {
          if (/^https?:\/\//i.test(u)) return { url: u }
          const p = join(process.cwd(), 'public', u.replace(/^\//, ''))
          if (existsSync(p)) return { url: p }
          return { url: `${mediaBase}${u.startsWith('/') ? '' : '/'}${u}` }
        }
        const imgs = Array.isArray(media.images) ? media.images : []
        for (let i = 0; i < imgs.length; i++) {
          try {
            await new Promise(resolve => setTimeout(resolve, i === 0 ? 800 : 500))
            // El caption (nombre + precio) solo en la PRIMERA foto.
            this._rememberSent(await this.sock.sendMessage(remoteJid!, { image: resolveSrc(imgs[i]), caption: i === 0 ? (media.caption || undefined) : undefined }))
          } catch (imgErr) {
            console.warn(`[WA:${this.workspaceId}] Foto ${i + 1} send failed:`, imgErr)
          }
        }
        if (media.video) {
          try {
            await new Promise(resolve => setTimeout(resolve, 600))
            this._rememberSent(await this.sock.sendMessage(remoteJid!, { video: resolveSrc(media.video), caption: imgs.length === 0 ? (media.caption || undefined) : undefined }))
          } catch (vidErr) {
            console.warn(`[WA:${this.workspaceId}] Video send failed:`, vidErr)
          }
        }
        // Deja constancia en el CRM de que el bot envió las fotos/video del auto.
        await db.message.create({ data: { conversationId: coreResult.conversationId, content: `${media.caption ? media.caption + '\n' : ''}📷 Envié ${imgs.length} foto(s)${media.video ? ' + video' : ''} del auto`, type: 'text', direction: 'outbound', senderType: 'agent', status: 'sent', isAiGenerated: true, metadata: JSON.stringify({ source: 'inventory-media', images: imgs, video: media.video || null }) } }).catch(() => {})
        console.log(`[WA:${this.workspaceId}] Media enviada a ${phone}: ${imgs.length} foto(s)${media.video ? ' + video' : ''}`)
      }
    } catch (error) {
      console.error(`[WA:${this.workspaceId}] Pipeline failed for ${phone}:`, error)
      // Fallback: ante un error real de la IA, NO dejar al cliente sin respuesta.
      // (No aplica al silencio intencional cuando un humano toma el control: ese
      //  caso NO llega aquí, se maneja dentro del pipeline con success:true.)
      try {
        if (this.sock && this._connected && remoteJid) {
          this._rememberSent(await this.sock.sendMessage(remoteJid, { text: 'Disculpa, tuve un problema para procesar tu mensaje. ¿Podrías repetirlo o decirlo de otra forma? En un momento te atiendo.' }))
        }
      } catch { /* ignore */ }
    } finally {
      this.releaseProcessingLock(phone)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// WhatsAppRegistry — Map<workspaceId, WhatsAppManager>
// ═══════════════════════════════════════════════════════════════

class WhatsAppRegistry {
  private managers = new Map<string, WhatsAppManager>()
  private bootstrapped = false
  private watchdogTimer: ReturnType<typeof setInterval> | null = null

  /**
   * Watchdog 24/7: cada 45s revisa cada manager que DEBERÍA estar conectado
   * (wantsConnection) pero no lo está, y lo revive vía ensureConnected (que ya
   * está throttleado). Es la red de seguridad si la cadena de reconexión por
   * eventos se rompe: mantiene WhatsApp vivo sin intervención manual.
   */
  startWatchdog(): void {
    if (this.watchdogTimer) return
    this.watchdogTimer = setInterval(() => {
      for (const mgr of this.managers.values()) {
        try {
          if (mgr.wantsConnection() && !mgr.isHealthy()) {
            console.log(`[WhatsAppWatchdog] ${mgr.workspaceId} caído — reviviendo`)
            mgr.ensureConnected()
          }
        } catch (e) {
          console.warn('[WhatsAppWatchdog] error:', e instanceof Error ? e.message : e)
        }
      }
    }, 45_000)
    // No mantener el proceso vivo solo por el watchdog
    if (typeof (this.watchdogTimer as any).unref === 'function') (this.watchdogTimer as any).unref()
    console.log('[WhatsAppRegistry] Watchdog 24/7 iniciado (cada 45s)')
  }

  /**
   * Get (or lazily create) the manager for a workspace.
   * Throws if workspaceId is missing — callers MUST resolve workspace
   * from the authenticated session, not from any implicit global state.
   */
  get(workspaceId: string): WhatsAppManager {
    if (!workspaceId || workspaceId === 'default') {
      throw new Error(`[WhatsAppRegistry] Invalid workspaceId="${workspaceId}". Cannot resolve manager.`)
    }
    let mgr = this.managers.get(workspaceId)
    if (!mgr) {
      mgr = new WhatsAppManager(workspaceId)
      this.managers.set(workspaceId, mgr)
      console.log(`[WhatsAppRegistry] Created manager for workspace ${workspaceId}`)
    }
    return mgr
  }

  tryGet(workspaceId: string): WhatsAppManager | undefined {
    if (!workspaceId || workspaceId === 'default') return undefined
    return this.managers.get(workspaceId)
  }

  all(): WhatsAppManager[] { return [...this.managers.values()] }

  /**
   * Bootstrap: load all existing WhatsAppAuth records from DB and create
   * managers so cold-start (server restart) can reconnect every workspace
   * that had WhatsApp linked. Also wipes orphaned 'default' records.
   */
  async bootstrapFromDb(): Promise<void> {
    if (this.bootstrapped) return
    this.bootstrapped = true
    try {
      const { db } = await import('@/lib/db')

      // Delete orphaned 'default' records — we refuse to migrate them
      // to a tenant because that's exactly how the cross-tenant bug
      // originally happened.
      const orphans = await db.whatsAppAuth.deleteMany({ where: { workspace: 'default' } })
      if (orphans.count > 0) {
        console.warn(`[WhatsAppRegistry] Deleted ${orphans.count} orphaned 'default' WhatsAppAuth record(s)`)
      }

      const records = await db.whatsAppAuth.findMany({ select: { workspace: true } })

      // Only auto-start Baileys for workspaces that have auth AND waChannel='baileys' (or no waChannel set)
      const workspaceChannels = await db.workspace.findMany({
        where: { isActive: true },
        select: { id: true, waChannel: true },
      })
      const baileysByWsId = new Set(
        workspaceChannels
          .filter(w => !w.waChannel || w.waChannel === 'baileys')
          .map(w => w.id)
      )

      for (const r of records) {
        if (r.workspace && r.workspace !== 'default' && !this.managers.has(r.workspace)) {
          const mgr = new WhatsAppManager(r.workspace)
          this.managers.set(r.workspace, mgr)
          // Auto-start only for Baileys workspaces with stored credentials
          if (baileysByWsId.has(r.workspace)) {
            setTimeout(() => {
              mgr.triggerColdStartConnect()
            }, Math.random() * 3000) // Stagger starts to avoid thundering herd
          }
        }
      }
      console.log(`[WhatsAppRegistry] Bootstrapped ${this.managers.size} workspace manager(s)`)
    } catch (err) {
      console.error('[WhatsAppRegistry] Bootstrap failed:', err)
    }
  }
}

// ─── Global Registry (hot-reload safe) ────────────────────────

const globalForRegistry = globalThis as unknown as {
  whatsAppRegistry?: WhatsAppRegistry
}

let whatsAppRegistry: WhatsAppRegistry
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
const isTestEnvironment = process.env.NODE_ENV === 'test'

if (globalForRegistry.whatsAppRegistry) {
  whatsAppRegistry = globalForRegistry.whatsAppRegistry
} else {
  whatsAppRegistry = new WhatsAppRegistry()
  globalForRegistry.whatsAppRegistry = whatsAppRegistry
  if (!isBuildPhase && !isTestEnvironment) {
    whatsAppRegistry.bootstrapFromDb().catch((e) => console.error('[WhatsAppRegistry] bootstrap error:', e))
    whatsAppRegistry.startWatchdog()
  }
}

/**
 * Helper: resolve the WhatsAppManager for a specific workspace.
 * USE THIS in every route/handler. Never use a global "default" manager.
 */
export function getWhatsAppManager(workspaceId: string): WhatsAppManager {
  return whatsAppRegistry.get(workspaceId)
}

export function tryGetWhatsAppManager(workspaceId: string): WhatsAppManager | undefined {
  return whatsAppRegistry.tryGet(workspaceId)
}

export { whatsAppRegistry }
export default whatsAppRegistry
