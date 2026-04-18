// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Media File Serve API
// GET /api/media/[id] — Serve media file by ID
// GET /api/media/[id]/thumbnail — Serve thumbnail
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { getMediaFilePath, getMediaThumbnailPath, getMediaInfo } from '@/lib/whatsapp/media-handler'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if this is a thumbnail request
    const url = new URL(req.url)
    const isThumbnail = url.pathname.endsWith('/thumbnail')

    const mediaInfo = await getMediaInfo(id)
    if (!mediaInfo) {
      return new Response('Media not found', { status: 404 })
    }

    const filePath = isThumbnail
      ? await getMediaThumbnailPath(id)
      : await getMediaFilePath(id)

    if (!filePath) {
      return new Response('File not found on disk', { status: 404 })
    }

    const fs = await import('fs')
    const stat = fs.statSync(filePath)

    // Range support for video/audio
    const range = req.headers.get('range')
    if (range && (mediaInfo.mimeType.startsWith('video/') || mediaInfo.mimeType.startsWith('audio/'))) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const chunkSize = end - start + 1

      const fileBuffer = fs.createReadStream(filePath, { start, end })

      return new Response(fileBuffer as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': mediaInfo.mimeType,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

    // Full file response
    const fileBuffer = fs.readFileSync(filePath)

    // For images and videos, allow embedding
    const headers: Record<string, string> = {
      'Content-Type': mediaInfo.mimeType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=86400',
    }

    // Content-Disposition for documents (download)
    if (mediaInfo.mimeType.startsWith('application/') || mediaInfo.source === 'upload') {
      headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(mediaInfo.fileName)}"`
    }

    return new Response(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('[Media API] Error serving media:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
