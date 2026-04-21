import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// Map MIME types to simple content types for media serving
const MIME_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
  'application/pdf': 'application/pdf',
  'text/plain': 'text/plain',
  'text/csv': 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Archivo demasiado grande (máximo 10MB)' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido. Usa JPG, PNG, GIF, WebP, PDF, TXT, CSV, XLSX o DOCX.' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Create upload directory
    const uploadDir = join(process.cwd(), 'uploads')
    await mkdir(uploadDir, { recursive: true })

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin'
    const fileId = randomUUID()
    const filename = `${fileId}.${ext}`
    const filepath = join(uploadDir, filename)

    await writeFile(filepath, buffer)

    // Save to DB as MediaFile record (so /api/media/[id] can serve it)
    const mediaFile = await db.mediaFile.create({
      data: {
        id: fileId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        filePath: `uploads/${filename}`,
        source: 'upload',
        workspaceId: session.workspaceId || null,
      },
    })

    const publicUrl = `/api/media/${fileId}.${ext}`

    return NextResponse.json({
      success: true,
      url: publicUrl,
      mediaId: mediaFile.id,
      filename: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error: any) {
    return errorResponse(error, 'Error al subir archivo')
  }
}
