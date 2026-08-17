// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Media File Serve API
// GET /api/media/[id] — Serve media file by ID
// Supports both DB-registered media and direct file lookups
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { join } from 'path'
import { existsSync, statSync, readFileSync, createReadStream } from 'fs'
import { requireAuth, requireWorkspace } from '@/lib/api-auth'

// Common MIME type mappings for fallback
const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.csv': 'text/csv', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.opus': 'audio/opus', '.webm': 'video/webm',
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return MIME_MAP[`.${ext}`] || 'application/octet-stream'
}

function parseMediaId(id: string): { fileId: string; ext: string } {
  // Sanitize: only allow alphanumeric, hyphens, and underscores (UUID-safe)
  // This prevents path traversal via encoded sequences or dot-dot segments
  const safe = id.replace(/[^a-zA-Z0-9\-_]/g, '')
  if (safe !== id) {
    // If extension was stripped, try to recover it from the original safely
    const dotIdx = id.lastIndexOf('.')
    if (dotIdx > 0) {
      const rawExt = id.slice(dotIdx + 1)
      // Only allow known safe extensions
      const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
      const safeBase = id.slice(0, dotIdx).replace(/[^a-zA-Z0-9\-_]/g, '')
      return { fileId: safeBase, ext: safeExt }
    }
  }
  // Handle both formats: "uuid" (DB lookup) and "uuid.ext" (direct file)
  const parts = id.split('.')
  if (parts.length >= 2) {
    return { fileId: parts.slice(0, -1).join('.'), ext: parts[parts.length - 1] }
  }
  return { fileId: id, ext: '' }
}

async function tryServeFromDb(id: string, req: NextRequest) {
  // Dynamic import to avoid bundling issues
  const { getMediaInfo, getMediaFilePath, getMediaThumbnailPath } = await import('@/lib/whatsapp/media-handler')

  const mediaInfo = await getMediaInfo(id)
  if (!mediaInfo) return null

  const url = new URL(req.url)
  const isThumbnail = url.pathname.endsWith('/thumbnail')

  const filePath = isThumbnail
    ? await getMediaThumbnailPath(id)
    : await getMediaFilePath(id)

  if (!filePath || !existsSync(filePath)) return null

  return { filePath, mimeType: mediaInfo.mimeType, fileName: mediaInfo.fileName, source: mediaInfo.source }
}

function tryServeFromDisk(id: string, ext: string) {
  // Direct file lookup: uploads/uuid.ext
  const filename = ext ? `${id}.${ext}` : id
  const uploadsBase = join(process.cwd(), 'uploads')
  const uploadPath = join(uploadsBase, filename)

  // Guard: ensure resolved path stays within the uploads directory
  if (!uploadPath.startsWith(uploadsBase + (process.platform === 'win32' ? '\\' : '/'))) {
    return null
  }

  if (!existsSync(uploadPath)) {
    // Also try the WhatsApp media path
    const waBase = join(process.cwd(), '.whatsapp-media')
    const waPath = join(waBase, filename)
    if (!waPath.startsWith(waBase + (process.platform === 'win32' ? '\\' : '/'))) return null
    if (!existsSync(waPath)) return null
    return { filePath: waPath, mimeType: getMimeType(filename), fileName: filename, source: 'disk' }
  }

  return { filePath: uploadPath, mimeType: getMimeType(filename), fileName: filename, source: 'upload' }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // SEC-002: Require authenticated session
    const session = await requireAuth(req)

    const { id } = await params
    const { fileId, ext } = parseMediaId(id)

    // SEC-002: Verify workspace ownership for DB-registered media
    const { getMediaInfo } = await import('@/lib/whatsapp/media-handler')
    const mediaRecord = await getMediaInfo(fileId)
    if (mediaRecord?.workspaceId) {
      await requireWorkspace(mediaRecord.workspaceId, session.userId)
    }

    // Try DB lookup first, then direct disk
    let media = await tryServeFromDb(fileId, req)
    if (!media) {
      media = tryServeFromDisk(fileId, ext)
    }
    if (!media) {
      return new Response('Media not found', { status: 404 })
    }

    const stat = statSync(media.filePath)
    const mimeType = media.mimeType || getMimeType(media.fileName)

    // Range support for video/audio
    const range = req.headers.get('range')
    if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const chunkSize = end - start + 1

      const fileBuffer = createReadStream(media.filePath, { start, end })

      return new Response(fileBuffer as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

    // Full file response
    const fileBuffer = readFileSync(media.filePath)

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=86400',
    }

    // Content-Disposition for documents (download)
    if (mimeType.startsWith('application/') || media.source === 'upload') {
      headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(media.fileName)}"`
    }

    return new Response(fileBuffer, { status: 200, headers })
  } catch (error) {
    console.error('[Media API] Error serving media:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
