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

    const mimeType = file.type || 'application/octet-stream'
    const mediaType = ALLOWED_MIME_TYPES[mimeType] || 'document'

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || ''
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const filePath = join(UPLOAD_DIR, uniqueName)

    // Write file to disk
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    // Build the URL path (served from /public)
    const fileUrl = `/uploads/${uniqueName}`

    // Create MediaFile record in database
    const mediaFile = await db.mediaFile.create({
      data: {
        workspaceId: workspaceId || undefined,
        conversationId: conversationId || undefined,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
        filePath: fileUrl,
        source: 'upload',
      },
    })

    return Response.json({
      success: true,
      mediaFile: {
        id: mediaFile.id,
        fileName: mediaFile.fileName,
        mimeType: mediaFile.mimeType,
        fileSize: mediaFile.fileSize,
        filePath: mediaFile.filePath,
        mediaType,
        fileUrl,
      },
    }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
