// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — File Upload API
// POST /api/upload — Upload a file (from Inbox paperclip)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { saveUploadedFile } from '@/lib/whatsapp/media-handler'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const conversationId = formData.get('conversationId') as string | null

    if (!file) {
      return Response.json(
        { error: 'No se proporciono ningun archivo' },
        { status: 400 }
      )
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      return Response.json(
        { error: 'El archivo excede el limite de 20MB' },
        { status: 413 }
      )
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/3gp', 'video/webm',
      'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      return Response.json(
        { error: 'Tipo de archivo no soportado' },
        { status: 415 }
      )
    }

    const mediaId = await saveUploadedFile(file, file.name, file.type, {
      conversationId: conversationId || undefined,
    })

    if (!mediaId) {
      return Response.json(
        { error: 'Error al guardar el archivo' },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      mediaId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      url: `/api/media/${mediaId}`,
    })
  } catch (error) {
    console.error('[Upload API] Error:', error)
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
