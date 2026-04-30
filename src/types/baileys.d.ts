// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Baileys Type Definitions
// Minimal type declarations for @whiskeysockets/baileys
// Covers: WAMessage, WAMessageContent, WASocket, MediaInfo
// ═══════════════════════════════════════════════════════════════

// ─── WAMessage Key ────────────────────────────────────────────

export interface WAMessageKey {
  /** Remote JID (e.g. '5215512345678@s.whatsapp.net') */
  remoteJid?: string
  /** Unique message ID */
  id?: string
  /** Whether the message was sent by this device */
  fromMe?: boolean
  /** Participant JID in group messages */
  participant?: string
}

// ─── Message Stub Types ───────────────────────────────────────

export type WAMessageStubType =
  | 'REVOKE'
  | 'GROUP_CREATE'
  | 'GROUP_CHANGE_SUBJECT'
  | 'GROUP_CHANGE_ICON'
  | 'GROUP_ADD_PARTICIPANT'
  | 'GROUP_REMOVE_PARTICIPANT'
  | 'GROUP_LEAVE'
  | 'EPHEMERAL_SETTING'
  | 'UNKNOWN'

// ─── Message Sub-Types ────────────────────────────────────────

export interface WATextMessage {
  conversation?: string
}

export interface WAExtendedTextMessage {
  text?: string
  matchedText?: string
  canonicalUrl?: string
  description?: string
  title?: string
  previewType?: number
  jpegThumbnail?: Buffer
  contextInfo?: WAContextInfo
}

export interface WAContextInfo {
  stanzaId?: string
  participant?: string
  quotedMessage?: WAMessageContent
  remoteJid?: string
  mentionedJid?: string[]
  groupMentions?: Array<{ participant: string; groupJid: string }>
  conversionSource?: string
  conversionData?: string
  conversionDelaySeconds?: number
}

export interface WAImageMessage {
  url?: string
  mimetype?: string
  caption?: string
  fileSha256?: Buffer
  fileLength?: number
  height?: number
  width?: number
  mediaKey?: Buffer
  fileEncSha256?: Buffer
  jpegThumbnail?: Buffer
  directPath?: string
}

export interface WAVideoMessage {
  url?: string
  mimetype?: string
  caption?: string
  fileSha256?: Buffer
  fileLength?: number
  height?: number
  width?: number
  seconds?: number
  mediaKey?: Buffer
  gifPlayback?: boolean
  fileEncSha256?: Buffer
  jpegThumbnail?: Buffer
  directPath?: string
}

export interface WAAudioMessage {
  url?: string
  mimetype?: string
  fileSha256?: Buffer
  fileLength?: number
  seconds?: number
  mediaKey?: Buffer
  fileEncSha256?: Buffer
  directPath?: string
  /** Push-to-talk (voice note) */
  ptt?: boolean
  waveform?: Buffer
}

export interface WADocumentMessage {
  url?: string
  mimetype?: string
  title?: string
  fileName?: string
  fileSha256?: Buffer
  fileLength?: number
  pageCount?: number
  mediaKey?: Buffer
  fileEncSha256?: Buffer
  jpegThumbnail?: Buffer
  directPath?: string
  caption?: string
}

export interface WAStickerMessage {
  url?: string
  mimetype?: string
  fileSha256?: Buffer
  fileLength?: number
  height?: number
  width?: number
  mediaKey?: Buffer
  fileEncSha256?: Buffer
  directPath?: string
  isAnimated?: boolean
  jpegThumbnail?: Buffer
}

export interface WALocationMessage {
  degreesLatitude?: number
  degreesLongitude?: number
  name?: string
  address?: string
  url?: string
  jpegThumbnail?: Buffer
  location?: {
    degreesLatitude?: number
    degreesLongitude?: number
    name?: string
    address?: string
    url?: string
  }
}

export interface WAContactMessage {
  displayName?: string
  vcard?: string
  contact?: {
    displayName?: string
    vcard?: string
  }
}

// ─── WAMessageContent (union of all message types) ────────────

export interface WAMessageContent {
  conversation?: string
  extendedTextMessage?: WAExtendedTextMessage
  imageMessage?: WAImageMessage
  videoMessage?: WAVideoMessage
  audioMessage?: WAAudioMessage
  documentMessage?: WADocumentMessage
  stickerMessage?: WAStickerMessage
  locationMessage?: WALocationMessage
  contactMessage?: WAContactMessage
  [key: string]: unknown
}

// ─── WAMessage ────────────────────────────────────────────────

export interface WAMessage {
  key: WAMessageKey
  message?: WAMessageContent
  /** Message stub type for system messages */
  messageStubType?: WAMessageStubType
  /** Message stub parameters */
  messageStubParameters?: string[]
  /** Sender push name */
  pushName?: string
  /** Broadcast flag */
  broadcast?: boolean
  /** Message type (notify, append) */
  type?: 'notify' | 'append'
  /** Timestamp in seconds */
  messageTimestamp?: number
  /** Epoch timestamp in milliseconds */
  epoch?: number
  /** Unique message ID (same as key.id) */
  id?: string
  [key: string]: unknown
}

// ─── Disconnect Reason ────────────────────────────────────────

export interface DisconnectReason {
  loggedOut: number
  connectionClosed: number
  connectionLost: number
  timedOut: number
  restartRequired: number
  badSession: number
  multideviceMismatch: number
}

// ─── Connection Update ────────────────────────────────────────

export interface ConnectionUpdate {
  connection?: 'open' | 'close' | 'connecting' | 'updating'
  qr?: string
  lastDisconnect?: {
    error?: {
      output?: {
        statusCode: number
      }
      message?: string
    }
  }
  isNewLogin?: boolean
  receivedPendingNotifications?: boolean
}

// ─── WASocket Events ──────────────────────────────────────────

export interface WASocketEventMap {
  'connection.update': (update: ConnectionUpdate) => void
  'credentials.update': (update: { state: 'CONNECTED' | 'OPENING' | 'PAIRING' | 'UNPAIRED' | 'UNPAIRED_IDLE' }) => void
  'creds.update': (update: Record<string, unknown>) => void
  'messages.upsert': (m: { type: 'notify' | 'append'; messages: WAMessage[] }) => void
  'messages.update': (m: { key: WAMessageKey; update: Record<string, unknown> }[]) => void
  'message-receipt.update': (m: { key: WAMessageKey; receipt: unknown }[]) => void
  'groups.update': (updates: unknown[]) => void
  'group-participants.update': (update: { id: string; participants: string[]; action: string }) => void
  'presence.update': (update: { id: string; presences: Record<string, string> }) => void
  'chats.update': (updates: unknown[]) => void
  'chats.delete': (ids: string[]) => void
  'contacts.upsert': (contacts: unknown[]) => void
  'contacts.update': (updates: unknown[]) => void
  'blocklist.set': (blocklist: unknown[]) => void
}

// ─── EventEmitter (minimal) ──────────────────────────────────

export interface WAEventEmitter<TEventMap extends Record<string, (...args: any[]) => void>> {
  on<E extends keyof TEventMap & string>(event: E, listener: TEventMap[E]): this
  off<E extends keyof TEventMap & string>(event: E, listener: TEventMap[E]): this
  emit<E extends keyof TEventMap & string>(event: E, ...args: Parameters<TEventMap[E]>): boolean
  removeAllListeners(event?: string): this
}

// ─── SendMessage Result ───────────────────────────────────────

export interface SendMessageResult {
  key: WAMessageKey
  message?: WAMessageContent
  messageTimestamp?: number
  status?: number
}

// ─── WASocket (minimal interface) ─────────────────────────────

export interface WASocket {
  /** Event emitter for Baileys events */
  ev: WAEventEmitter<WASocketEventMap>

  /** User info after connection is established */
  user?: {
    id: string
    name?: string
    pushName?: string
  }

  /**
   * Send a message to a JID.
   * @param jid - The JID to send to (e.g. '5215512345678@s.whatsapp.net')
   * @param content - The message content
   * @param options - Optional send options
   */
  sendMessage(
    jid: string,
    content: WAMessageContent | { text: string },
    options?: Record<string, unknown>
  ): Promise<SendMessageResult>

  /**
   * Update presence status for a JID.
   * @param type - 'composing', 'paused', 'available', 'unavailable'
   * @param jid - The JID to update presence for
   */
  sendPresenceUpdate(
    type: 'composing' | 'paused' | 'available' | 'unavailable',
    jid: string
  ): Promise<void>

  /**
   * Logout and disconnect.
   */
  logout(reason?: string): Promise<unknown>

  /**
   * underlying WebSocket reference
   */
  ws?: { readyState: number }
}

// ─── MediaInfo ────────────────────────────────────────────────

export interface MediaInfo {
  /** Media type */
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact'
  /** Media URL (for downloadable media) */
  url?: string
  /** MIME type */
  mimeType?: string
  /** File name */
  fileName?: string
  /** Caption (for images/videos/documents) */
  caption?: string
  /** File size in bytes */
  fileSize?: number
  /** Image/video width */
  width?: number
  /** Image/video height */
  height?: number
  /** Duration in seconds (audio/video) */
  durationSeconds?: number
  /** Media encryption key */
  mediaKey?: string | Buffer
  /** External ID for deduplication */
  externalId?: string | Buffer
  /** Location: latitude */
  latitude?: number
  /** Location: longitude */
  longitude?: number
  /** Location: place name */
  locationName?: string
  /** Location: address */
  locationAddress?: string
  /** Contact: display name */
  contactName?: string
  /** Contact: phone number */
  contactPhone?: string
}

// ─── Module augmentation for @whiskeysockets/baileys ───────────

declare module '@whiskeysockets/baileys' {
  export interface WAMessageKey {
    remoteJid?: string
    id?: string
    fromMe?: boolean
    participant?: string
  }

  export type WAMessageStubType =
    | 'REVOKE'
    | 'GROUP_CREATE'
    | 'GROUP_CHANGE_SUBJECT'
    | 'GROUP_CHANGE_ICON'
    | 'GROUP_ADD_PARTICIPANT'
    | 'GROUP_REMOVE_PARTICIPANT'
    | 'GROUP_LEAVE'
    | 'EPHEMERAL_SETTING'
    | 'UNKNOWN'

  export interface WAMessage {
    key: WAMessageKey
    message?: Record<string, unknown>
    messageStubType?: WAMessageStubType
    messageStubParameters?: string[]
    pushName?: string
    broadcast?: boolean
    type?: 'notify' | 'append'
    messageTimestamp?: number
    id?: string
    [key: string]: unknown
  }

  export interface WASocket {
    ev: WAEventEmitter<WASocketEventMap>
    user?: { id: string; name?: string; pushName?: string }
    sendMessage(jid: string, content: unknown, options?: Record<string, unknown>): Promise<{ key: WAMessageKey; messageTimestamp?: number }>
    sendPresenceUpdate(type: string, jid: string): Promise<void>
    logout(reason?: string): Promise<unknown>
    ws?: { readyState: number }
  }

  export function makeWASocket(config: Record<string, unknown>): WASocket
  export function useMultiFileAuthState(folder: string): Promise<{ state: { creds: Record<string, unknown>; keys: Record<string, unknown> }; saveCreds: () => Promise<void> }>
  export function fetchLatestBaileysVersion(): Promise<{ version: string; isLatest: boolean }>
  export const DisconnectReason: DisconnectReason
  export function downloadMediaMessage(msg: unknown, type: 'buffer' | 'stream', options?: Record<string, unknown>): Promise<unknown>
}
