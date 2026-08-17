// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — File Upload API
// POST /api/uploads — Upload a file and create MediaFile record
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { db } from '@/lib/db'
import { requireAuth, errorResponse } from '@/lib/api-auth'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/3gp': 'video',
  'audio/ogg': 'audio',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/mp4': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/csv': 'document',
}

// MIME type → safe file extension
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/3gp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
}

/**
 * Validate magic bytes to detect MIME type spoofing.
 * Returns the detected MIME type or null if unrecognized/spoofed.
 */
function detectMimeFromBytes(bytes: Uint8Array): string | null {
  const b = bytes
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
  if (b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'audio/ogg'
  // MP3: ID3 tag or sync bytes
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg'
  if ((b[0] === 0xFF && (b[1] === 0xFB || b[1] === 0xF3 || b[1] === 0xF2))) return 'audio/mpeg'
  // Legacy DOC (OLE2)
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'application/msword'
  // ZIP-based (DOCX, XLSX)
  if (b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) return 'application/zip'
  // RIFF (WebP/MP4/3GP)
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    // RIFF....WEBP
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  }
  // MP4/3GP/HEIC/AVIF: ftyp box at offset 4
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand.startsWith('3gp')) return 'video/3gp'
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
    if (['avif', 'avis'].includes(brand)) return 'image/avif'
    return 'video/mp4'
  }
  return null
}

// Tipos de imagen que el contenido real puede tener y aceptamos tal cual.
const TRUSTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
// Formatos de cámara (iPhone) que convertimos a JPEG con sharp.
const CONVERT_TO_JPEG = new Set(['image/heic', 'image/avif'])

/**
 * Returns true if the magic-bytes detected type is compatible with the declared MIME type.
 * Allows ZIP magic bytes for DOCX/XLSX (they are ZIP containers).
 */
function isMimeCompatible(declared: string, detected: string | null): boolean {
  if (!detected) return false
  if (declared === detected) return true
  // DOCX/XLSX are ZIP files internally
  if (detected === 'application/zip') {
    return declared === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
           declared === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const conversationId = formData.get('conversationId') as string | null
    const workspaceId = formData.get('workspaceId') as string | null

    if (!file) {
      return Response.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'El archivo excede el límite de 20MB' }, { status: 400 })
    }

    const declaredMime = file.type || 'application/octet-stream'
    const declaresImage = declaredMime.startsWith('image/')
    if (!(declaredMime in ALLOWED_MIME_TYPES) && !declaresImage) {
      return Response.json({ error: 'Tipo de archivo no permitido. Imágenes: JPG, PNG, WebP o GIF.' }, { status: 400 })
    }

    // Read bytes and validate magic bytes to prevent MIME spoofing (VULN-015)
    let bytes = await file.arrayBuffer()
    const byteArray = new Uint8Array(bytes)
    const detectedMime = detectMimeFromBytes(byteArray)

    // Para imágenes MANDA EL CONTENIDO REAL, no el nombre del archivo:
    // un .png que por dentro es JPEG (típico de fotos bajadas de WhatsApp)
    // se acepta como JPEG en vez de rechazarse por "no coincide".
    let effectiveMime = declaredMime
    if (declaresImage || TRUSTED_IMAGE_TYPES.has(detectedMime || '') || CONVERT_TO_JPEG.has(detectedMime || '')) {
      if (detectedMime && TRUSTED_IMAGE_TYPES.has(detectedMime)) {
        effectiveMime = detectedMime
      } else if (detectedMime && CONVERT_TO_JPEG.has(detectedMime)) {
        // Foto de iPhone (HEIC) o AVIF → convertir a JPEG universal
        try {
          const { default: sharp } = await import('sharp')
          const jpeg = await sharp(Buffer.from(bytes)).rotate().jpeg({ quality: 88 }).toBuffer()
          bytes = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer
          effectiveMime = 'image/jpeg'
        } catch {
          return Response.json({ error: 'Formato de foto de iPhone (HEIC) no soportado. En tu iPhone: Ajustes → Cámara → Formatos → "Más compatible", o comparte la foto como JPG.' }, { status: 400 })
        }
      } else {
        return Response.json({ error: 'La imagen no es un formato válido. Usa JPG, PNG, WebP o GIF.' }, { status: 400 })
      }
    } else {
      // CSV has no magic bytes — allow as text but skip detection
      const isCsv = declaredMime === 'text/csv'
      if (!isCsv && !isMimeCompatible(declaredMime, detectedMime)) {
        return Response.json({ error: 'El contenido del archivo no coincide con su tipo declarado' }, { status: 400 })
      }
    }

    const mediaType = ALLOWED_MIME_TYPES[effectiveMime] || 'document'
    const safeExt = MIME_TO_EXT[effectiveMime] || 'bin'

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename using verified extension (no user-controlled input)
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
    const filePath = join(UPLOAD_DIR, uniqueName)

    // Write file to disk
    await writeFile(filePath, Buffer.from(bytes))

    // Build the URL path (served from /public)
    const fileUrl = `/uploads/${uniqueName}`

    // Create MediaFile record in database
    const mediaFile = await db.mediaFile.create({
      data: {
        workspaceId: workspaceId || undefined,
        conversationId: conversationId || undefined,
        fileName: file.name,
        mimeType: effectiveMime,
        fileSize: Buffer.from(bytes).byteLength,
        filePath: fileUrl,
        source: 'upload',
      },
    })

    return Response.json({
      success: true,
      mediaFile: {
        id: mediaFile.id,
        fileName: mediaFile.fileName,
        mimeType: mediaFile.mimeType,        fileSize: mediaFile.fileSize,
        filePath: mediaFile.filePath,
        mediaType,
        fileUrl,
      },
    }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
