// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Media Handler
// Download, persist, and serve media from WhatsApp Business
// Handles: images, videos, audio, documents, stickers, locations
// ═══════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { db } from '@/lib/db'

// ─── Helpers ──────────────────────────────────────────────────

/** Convert Baileys Uint8Array fields (fileSha256, mediaKey) to hex string or null */
function bytesToHex(val: Uint8Array | string | null | undefined): string | null {
  if (!val) return null
  if (typeof val === 'string') return val
  if (val instanceof Uint8Array) return Buffer.from(val).toString('hex')
  return null
}

// ─── Constants ────────────────────────────────────────────────

const MEDIA_BASE_DIR = path.join(process.cwd(), 'media')
const WHATSAPP_DIR = path.join(MEDIA_BASE_DIR, 'whatsapp')
const UPLOADS_DIR = path.join(MEDIA_BASE_DIR, 'uploads')
const THUMBNAILS_DIR = path.join(MEDIA_BASE_DIR, 'thumbnails')

// Ensure directories exist
function ensureDirs() {
  for (const dir of [WHATSAPP_DIR, UPLOADS_DIR, THUMBNAILS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

// ─── Types ────────────────────────────────────────────────────

export type WAMediaMessage = {
  message?: {
    imageMessage?: any
    videoMessage?: any
    audioMessage?: any
    documentMessage?: any
    stickerMessage?: any
    locationMessage?: any
    contactMessage?: any
    extendedTextMessage?: any
    conversation?: string
  }
}

export interface MediaInfo {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact'
  mimeType: string
  fileName: string
  caption?: string
  fileSize?: number
  width?: number
  height?: number
  durationSeconds?: number
  mediaKey?: string
  externalId?: string
  // Location specific
  latitude?: number
  longitude?: number
  locationName?: string
  locationAddress?: string
  // Contact specific
  contactName?: string
  contactPhone?: string
}

// ─── Media Detection ──────────────────────────────────────────

/**
 * Detect if a WhatsApp message contains media and extract its metadata.
 * Returns null if the message is plain text only.
 */
export function detectMedia(msg: any): MediaInfo | null {
  const message = msg.message as any
  if (!message) return null

  // Image
  if (message.imageMessage) {
    const img = message.imageMessage
    return {
      type: 'image',
      mimeType: img.mimetype || 'image/jpeg',
      fileName: generateFileName('image', img.mimetype || 'image/jpeg'),
      caption: img.caption || undefined,
      fileSize: img.fileLength || undefined,
      width: img.width || undefined,
      height: img.height || undefined,
      mediaKey: bytesToHex(img.mediaKey) || undefined,
      externalId: bytesToHex(img.fileSha256) || bytesToHex(img.mediaKey) || undefined,
    }
  }

  // Video
  if (message.videoMessage) {
    const vid = message.videoMessage
    return {
      type: 'video',
      mimeType: vid.mimetype || 'video/mp4',
      fileName: generateFileName('video', vid.mimetype || 'video/mp4'),
      caption: vid.caption || undefined,
      fileSize: vid.fileLength || undefined,
      width: vid.width || undefined,
      height: vid.height || undefined,
      durationSeconds: vid.seconds || undefined,
      mediaKey: bytesToHex(vid.mediaKey) || undefined,
      externalId: bytesToHex(vid.fileSha256) || bytesToHex(vid.mediaKey) || undefined,
    }
  }

  // Audio (voice notes and regular audio)
  if (message.audioMessage) {
    const aud = message.audioMessage
    const isVoiceNote = aud.ptt === true
    return {
      type: 'audio',
      mimeType: isVoiceNote ? 'audio/ogg' : (aud.mimetype || 'audio/mp4'),
      fileName: generateFileName(
        isVoiceNote ? 'voice' : 'audio',
        isVoiceNote ? 'audio/ogg' : (aud.mimetype || 'audio/mp4')
      ),
      fileSize: aud.fileLength || undefined,
      durationSeconds: aud.seconds || undefined,
      mediaKey: bytesToHex(aud.mediaKey) || undefined,
      externalId: bytesToHex(aud.fileSha256) || bytesToHex(aud.mediaKey) || undefined,
    }
  }

  // Document
  if (message.documentMessage) {
    const doc = message.documentMessage
    return {
      type: 'document',
      mimeType: doc.mimetype || 'application/octet-stream',
      fileName: doc.fileName || generateFileName('document', doc.mimetype || 'application/octet-stream'),
      caption: doc.caption || undefined,
      fileSize: doc.fileLength || undefined,
      // pageCount removed — not in Baileys 7 document message
      mediaKey: bytesToHex(doc.mediaKey) || undefined,
      externalId: bytesToHex(doc.fileSha256) || bytesToHex(doc.mediaKey) || undefined,
    }
  }

  // Sticker
  if (message.stickerMessage) {
    const stk = message.stickerMessage
    return {
      type: 'sticker',
      mimeType: stk.mimetype || 'image/webp',
      fileName: generateFileName('sticker', stk.mimetype || 'image/webp'),
      fileSize: stk.fileLength || undefined,
      width: stk.width || undefined,
      height: stk.height || undefined,
      mediaKey: bytesToHex(stk.mediaKey) || undefined,
      externalId: bytesToHex(stk.fileSha256) || bytesToHex(stk.mediaKey) || undefined,
    }
  }

  // Location
  if (message.locationMessage) {
    const loc = message.locationMessage
    return {
      type: 'location',
      mimeType: 'text/location',
      fileName: `ubicacion_${Date.now()}.json`,
      latitude: loc.degreesLatitude,
      longitude: loc.degreesLongitude,
      locationName: loc.name || undefined,
      locationAddress: loc.address || undefined,
    }
  }

  // Contact
  if (message.contactMessage) {
    const ctc = message.contactMessage
    return {
      type: 'contact',
      mimeType: 'text/contact',
      fileName: `contacto_${Date.now()}.json`,
      contactName: ctc.displayName || undefined,
      contactPhone: ctc.vcard ? extractPhoneFromVcard(ctc.vcard) : undefined,
    }
  }

  return null
}

// ─── Media Download ───────────────────────────────────────────

/**
 * Download media from a WhatsApp message using Baileys socket.
 * Saves the file to disk and creates a MediaFile DB record.
 */
export async function downloadAndSaveMedia(
  sock: any,
  msg: any,
  mediaInfo: MediaInfo,
  options: {
    workspaceId?: string
    conversationId?: string
    messageId?: string
    waMsgKey?: string
  } = {}
): Promise<string | null> {
  ensureDirs()

  // For location and contact types, no download needed — save metadata as JSON
  if (mediaInfo.type === 'location' || mediaInfo.type === 'contact') {
    return await saveMetadataOnly(mediaInfo, options)
  }

  try {
    // Use Baileys' downloadMediaMessage to get the buffer
    const buffer = await downloadMediaBuffer(sock, msg)
    if (!buffer) {
      console.warn('[Media] Could not download media buffer')
      return null
    }

    // Save file to disk
    const filePath = path.join(WHATSAPP_DIR, mediaInfo.fileName)
    fs.writeFileSync(filePath, buffer)

    // Generate thumbnail for images and videos
    let thumbnailPath: string | null = null
    if (mediaInfo.type === 'image' || mediaInfo.type === 'video' || mediaInfo.type === 'sticker') {
      thumbnailPath = await generateThumbnail(buffer, mediaInfo)
    }

    // Save to database
    const mediaRecord = await db.mediaFile.create({
      data: {
        workspaceId: options.workspaceId,
        messageId: options.messageId,
        conversationId: options.conversationId,
        fileName: mediaInfo.fileName,
        mimeType: mediaInfo.mimeType,
        fileSize: buffer.length,
        filePath: path.join('whatsapp', mediaInfo.fileName),
        thumbnailPath: thumbnailPath ? path.join('thumbnails', path.basename(thumbnailPath)) : null,
        width: mediaInfo.width,
        height: mediaInfo.height,
        durationSeconds: mediaInfo.durationSeconds,
        caption: mediaInfo.caption,
        source: 'whatsapp',
        externalId: mediaInfo.externalId,
        metadata: JSON.stringify({
          mediaType: mediaInfo.type,
          isVoiceNote: mediaInfo.mimeType === 'audio/ogg',
          waMsgKey: options.waMsgKey,
        }),
      },
    })

    // Vincula al mensaje: si el mensaje de WhatsApp ya se guardó (mismo key),
    // enlázalo ahora. Si aún no existe, message-processor lo enlazará al guardarse.
    if (!options.messageId && options.waMsgKey) {
      const existing = await db.message.findFirst({ where: { externalId: options.waMsgKey }, select: { id: true, conversationId: true } }).catch(() => null)
      if (existing) {
        await db.mediaFile.update({ where: { id: mediaRecord.id }, data: { messageId: existing.id, conversationId: existing.conversationId } }).catch(() => {})
      }
    }

    console.log(`[Media] Saved: ${mediaInfo.fileName} (${buffer.length} bytes, ID: ${mediaRecord.id})`)
    return mediaRecord.id
  } catch (error) {
    console.error('[Media] Error downloading/saving media:', error)
    return null
  }
}

// ─── Download Buffer Helper ───────────────────────────────────

export async function downloadMediaBuffer(sock: any, msg: any): Promise<Buffer | null> {
  try {
    // Baileys v7 downloadMediaMessage
    const { downloadMediaMessage } = await import('@whiskeysockets/baileys')

    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      { /* options */ }
    )

    if (Buffer.isBuffer(buffer)) {
      return buffer
    }

    if ((buffer as any) instanceof Uint8Array) {
      return Buffer.from(buffer as Uint8Array)
    }

    if (typeof buffer === 'string') {
      return Buffer.from(buffer, 'base64')
    }

    console.warn('[Media] Unexpected buffer type:', typeof buffer)
    return null
  } catch (error) {
    console.error('[Media] downloadMediaMessage failed:', error)
    return null
  }
}

// ─── Thumbnail Generation ─────────────────────────────────────

async function generateThumbnail(
  buffer: Buffer,
  mediaInfo: MediaInfo
): Promise<string | null> {
  try {
    const sharp = await import('sharp')
    const thumbFileName = `thumb_${crypto.randomBytes(8).toString('hex')}.webp`
    const thumbPath = path.join(THUMBNAILS_DIR, thumbFileName)

    if (mediaInfo.type === 'video') {
      // For videos, use the first frame if possible (sharp can't extract video frames)
      // Fallback: skip thumbnail for now
      return null
    }

    // For images and stickers, resize to 200px width
    await sharp.default(buffer)
      .resize(200, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(thumbPath)

    console.log(`[Media] Thumbnail created: ${thumbFileName}`)
    return thumbPath
  } catch (error) {
    console.warn('[Media] Thumbnail generation failed:', error)
    return null
  }
}

// ─── Metadata-Only Save ───────────────────────────────────────

async function saveMetadataOnly(
  mediaInfo: MediaInfo,
  options: {
    workspaceId?: string
    conversationId?: string
    messageId?: string
  } = {}
): Promise<string | null> {
  try {
    ensureDirs()

    let metadataContent = ''
    let fileName = mediaInfo.fileName

    if (mediaInfo.type === 'location') {
      metadataContent = JSON.stringify({
        type: 'location',
        latitude: mediaInfo.latitude,
        longitude: mediaInfo.longitude,
        name: mediaInfo.locationName,
        address: mediaInfo.locationAddress,
      })
      fileName = `ubicacion_${Date.now()}.json`
    } else if (mediaInfo.type === 'contact') {
      metadataContent = JSON.stringify({
        type: 'contact',
        name: mediaInfo.contactName,
        phone: mediaInfo.contactPhone,
      })
      fileName = `contacto_${Date.now()}.json`
    }

    const filePath = path.join(WHATSAPP_DIR, fileName)
    fs.writeFileSync(filePath, metadataContent, 'utf-8')

    const mediaRecord = await db.mediaFile.create({
      data: {
        workspaceId: options.workspaceId,
        messageId: options.messageId,
        conversationId: options.conversationId,
        fileName,
        mimeType: mediaInfo.mimeType,
        fileSize: metadataContent.length,
        filePath: path.join('whatsapp', fileName),
        caption: mediaInfo.type === 'location'
          ? mediaInfo.locationName || 'Ubicacion compartida'
          : mediaInfo.contactName || 'Contacto compartido',
        source: 'whatsapp',
        externalId: mediaInfo.externalId,
        metadata: JSON.stringify({
          mediaType: mediaInfo.type,
          ...(mediaInfo.type === 'location' ? {
            latitude: mediaInfo.latitude,
            longitude: mediaInfo.longitude,
            locationName: mediaInfo.locationName,
            locationAddress: mediaInfo.locationAddress,
          } : {}),
          ...(mediaInfo.type === 'contact' ? {
            contactName: mediaInfo.contactName,
            contactPhone: mediaInfo.contactPhone,
          } : {}),
        }),
      },
    })

    console.log(`[Media] Metadata saved: ${fileName} (ID: ${mediaRecord.id})`)
    return mediaRecord.id
  } catch (error) {
    console.error('[Media] Error saving metadata:', error)
    return null
  }
}

// ─── File Upload Handler ─────────────────────────────────────

/**
 * Save an uploaded file from the web UI.
 * Returns the MediaFile ID.
 */
export async function saveUploadedFile(
  file: File | Buffer,
  originalName: string,
  mimeType: string,
  options: {
    workspaceId?: string
    conversationId?: string
    messageId?: string
    caption?: string
  } = {}
): Promise<string | null> {
  ensureDirs()

  try {
    const buffer = file instanceof Buffer ? file : Buffer.from(await (file as Blob).arrayBuffer())
    const ext = getExtension(mimeType, originalName)
    const safeName = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`
    const filePath = path.join(UPLOADS_DIR, safeName)

    fs.writeFileSync(filePath, buffer)

    let thumbnailPath: string | null = null
    if (mimeType.startsWith('image/')) {
      const thumbFileName = `thumb_${crypto.randomBytes(8).toString('hex')}.webp`
      const thumbFullPath = path.join(THUMBNAILS_DIR, thumbFileName)
      try {
        const sharp = await import('sharp')
        await sharp.default(buffer)
          .resize(200, null, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 70 })
          .toFile(thumbFullPath)
        thumbnailPath = path.join('thumbnails', thumbFileName)
      } catch { /* skip thumbnail */ }
    }

    const mediaRecord = await db.mediaFile.create({
      data: {
        workspaceId: options.workspaceId,
        messageId: options.messageId,
        conversationId: options.conversationId,
        fileName: safeName,
        mimeType,
        fileSize: buffer.length,
        filePath: path.join('uploads', safeName),
        thumbnailPath,
        caption: options.caption,
        source: 'upload',
        metadata: JSON.stringify({ originalName }),
      },
    })

    console.log(`[Media] Upload saved: ${safeName} (${buffer.length} bytes, ID: ${mediaRecord.id})`)
    return mediaRecord.id
  } catch (error) {
    console.error('[Media] Error saving uploaded file:', error)
    return null
  }
}

// ─── Get Media File Path ──────────────────────────────────────

/**
 * Get the absolute file path for a media file by ID.
 */
export async function getMediaFilePath(mediaFileId: string): Promise<string | null> {
  try {
    const mediaFile = await db.mediaFile.findUnique({
      where: { id: mediaFileId },
    })
    if (!mediaFile) return null

    const fullPath = path.join(MEDIA_BASE_DIR, mediaFile.filePath)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get thumbnail path for a media file.
 * Falls back to the original file if no thumbnail exists.
 */
export async function getMediaThumbnailPath(mediaFileId: string): Promise<string | null> {
  try {
    const mediaFile = await db.mediaFile.findUnique({
      where: { id: mediaFileId },
    })
    if (!mediaFile) return null

    if (mediaFile.thumbnailPath) {
      const thumbFullPath = path.join(MEDIA_BASE_DIR, mediaFile.thumbnailPath)
      if (fs.existsSync(thumbFullPath)) {
        return thumbFullPath
      }
    }

    // Fallback: return original file
    const fullPath = path.join(MEDIA_BASE_DIR, mediaFile.filePath)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
    return null
  } catch {
    return null
  }
}

/**
 * Get MediaFile record with all metadata.
 */
export async function getMediaInfo(mediaFileId: string) {
  try {
    return await db.mediaFile.findUnique({
      where: { id: mediaFileId },
    })
  } catch {
    return null
  }
}

/**
 * Get all media files for a specific message.
 */
export async function getMediaForMessage(messageId: string) {
  try {
    return await db.mediaFile.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    })
  } catch {
    return []
  }
}

// ─── Utility Functions ────────────────────────────────────────

function generateFileName(type: string, mimeType: string): string {
  const ext = getExtension(mimeType)
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString('hex')
  return `${type}_${timestamp}_${random}${ext}`
}

function getExtension(mimeType: string, originalName?: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/3gp': '.3gp',
    'video/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/csv': '.csv',
  }

  if (mimeMap[mimeType]) return mimeMap[mimeType]

  // Try to extract from original filename
  if (originalName) {
    const lastDot = originalName.lastIndexOf('.')
    if (lastDot > 0) {
      return originalName.slice(lastDot)
    }
  }

  return '.bin'
}

function extractPhoneFromVcard(vcard: string): string | undefined {
  const match = vcard.match(/TEL[^:]*:([+\d\s-]+)/)
  return match ? match[1].trim() : undefined
}

// ─── Format File Size ─────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ─── Get MIME Icon Info ──────────────────────────────────────

export function getMimeIconInfo(mimeType: string): {
  icon: string
  label: string
  color: string
} {
  if (mimeType.startsWith('image/')) return { icon: 'Image', label: 'Imagen', color: 'text-blue-500' }
  if (mimeType.startsWith('video/')) return { icon: 'Video', label: 'Video', color: 'text-purple-500' }
  if (mimeType.startsWith('audio/')) return { icon: 'Audio', label: 'Audio', color: 'text-orange-500' }
  if (mimeType.includes('pdf')) return { icon: 'FileText', label: 'PDF', color: 'text-red-500' }
  if (mimeType.includes('word') || mimeType.includes('document')) return { icon: 'FileText', label: 'Word', color: 'text-blue-600' }
  if (mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('csv'))
    return { icon: 'FileSpreadsheet', label: 'Excel', color: 'text-green-600' }
  if (mimeType === 'text/location') return { icon: 'MapPin', label: 'Ubicacion', color: 'text-emerald-500' }
  if (mimeType === 'text/contact') return { icon: 'User', label: 'Contacto', color: 'text-indigo-500' }
  return { icon: 'File', label: 'Archivo', color: 'text-zinc-500' }
}
