// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — WhatsApp Send Media API
// POST /api/whatsapp/send-media — Send media message via WhatsApp
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { getMediaFilePath, getMediaInfo } from '@/lib/whatsapp/media-handler'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)
    const body = await req.json()
    const { phone, mediaId, caption, conversationId } = body

    if (!phone || !mediaId) {
      return Response.json(
        { error: 'phone y mediaId son requeridos' },
        { status: 400 }
      )
    }

    // Get media info from DB
    const mediaInfo = await getMediaInfo(mediaId)
    if (!mediaInfo) {
      return Response.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    // Get file from disk
    const filePath = await getMediaFilePath(mediaId)
    if (!filePath) {
      return Response.json({ error: 'Archivo no encontrado en disco' }, { status: 404 })
    }

    // Import WhatsApp manager
    const { whatsAppManager } = await import('@/lib/whatsapp/connection')
    if (!whatsAppManager.isConnected()) {
      return Response.json({ error: 'WhatsApp no esta conectado' }, { status: 503 })
    }

    const fs = await import('fs')
    const fileBuffer = fs.readFileSync(filePath)

    // Import Baileys for message types
    const baileys = await import('@whiskeysockets/baileys')

    // Build the appropriate message type based on MIME
    let messageContent: any
    const jid = `${phone}@s.whatsapp.net`

    if (mediaInfo.mimeType.startsWith('image/')) {
      messageContent = {
        image: new baileys.MessageMedia(
          mediaInfo.mimeType,
          fileBuffer.toString('base64'),
          '',
          mediaInfo.fileName
        ),
        caption: caption || mediaInfo.caption || '',
      }
    } else if (mediaInfo.mimeType.startsWith('video/')) {
      messageContent = {
        video: new baileys.MessageMedia(
          mediaInfo.mimeType,
          fileBuffer.toString('base64'),
          '',
          mediaInfo.fileName
        ),
        caption: caption || mediaInfo.caption || '',
      }
    } else if (mediaInfo.mimeType.startsWith('audio/')) {
      messageContent = {
        audio: new baileys.MessageMedia(
          mediaInfo.mimeType,
          fileBuffer.toString('base64'),
          '',
          ''
        ),
        ptt: false, // not a voice note
        mimetype: mediaInfo.mimeType,
      }
    } else if (mediaInfo.mimeType.includes('pdf') || mediaInfo.mimeType.includes('document') || mediaInfo.mimeType.includes('sheet') || mediaInfo.mimeType.includes('csv')) {
      messageContent = {
        document: new baileys.MessageMedia(
          mediaInfo.mimeType,
          fileBuffer.toString('base64'),
          '',
          mediaInfo.fileName
        ),
        fileName: mediaInfo.fileName,
        caption: caption || mediaInfo.caption || '',
        mimetype: mediaInfo.mimeType,
      }
    } else {
      // Fallback: send as document
      messageContent = {
        document: new baileys.MessageMedia(
          mediaInfo.mimeType,
          fileBuffer.toString('base64'),
          '',
          mediaInfo.fileName
        ),
        fileName: mediaInfo.fileName,
        caption: caption || '',
        mimetype: mediaInfo.mimeType,
      }
    }

    // Send via WhatsApp
    const result = await whatsAppManager.sendMessageRaw(jid, messageContent)

    // Save message to DB
    if (conversationId) {
      const { db } = await import('@/lib/db')
      await db.message.create({
        data: {
          conversationId,
          content: caption || `[${mediaInfo.mimeType.split('/')[0]}: ${mediaInfo.fileName}]`,
          type: mediaInfo.mimeType.startsWith('image/') ? 'image'
            : mediaInfo.mimeType.startsWith('video/') ? 'video'
            : mediaInfo.mimeType.startsWith('audio/') ? 'audio'
            : 'document',
          direction: 'outbound',
          senderType: 'human',
          metadata: JSON.stringify({
            mediaFileId: mediaId,
            fileName: mediaInfo.fileName,
            fileSize: mediaInfo.fileSize,
            mimeType: mediaInfo.mimeType,
          }),
        },
      })
      await db.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: caption || `[${mediaInfo.fileName}]`,
        },
      })
    }

    return Response.json({
      success: true,
      messageId: result?.id,
      mediaId,
    })
  } catch (error) {
    console.error('[WhatsApp Send Media] Error:', error)
    return errorResponse(error)
  }
}
