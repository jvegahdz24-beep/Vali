// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Enviar imagen/archivo al cliente (operador, un solo paso).
// POST multipart: file, conversationId, workspaceId, caption?
// Sube (saveUploadedFile) + ENVÍA por WhatsApp (Baileys, desde el buffer) +
// registra el mensaje saliente. Evita el desajuste de rutas entre /api/uploads
// (public/uploads) y media-handler (media/uploads). RBAC: crm.write.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { saveUploadedFile } from '@/lib/whatsapp/media-handler'

const MAX = 25 * 1024 * 1024 // 25MB

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const form = await req.formData()
    const file = form.get('file') as File | null
    const conversationId = String(form.get('conversationId') || '')
    const workspaceId = String(form.get('workspaceId') || '')
    const caption = String(form.get('caption') || '').trim()
    if (!file) throw new ApiError(400, 'Falta el archivo')
    if (!conversationId || !workspaceId) throw new ApiError(400, 'Falta conversación o workspace')
    if (file.size > MAX) throw new ApiError(400, 'El archivo supera el límite (25MB)')

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const conv = await db.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: { contact: { select: { phone: true } } },
    })
    if (!conv) throw new ApiError(404, 'Conversación no encontrada')
    const phone = conv.contact?.phone
    if (!phone) throw new ApiError(400, 'El contacto no tiene teléfono')

    const mime = file.type || 'application/octet-stream'
    const kind: 'image' | 'video' | 'audio' | 'document' =
      mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document'
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name || `archivo.${mime.split('/')[1] || 'bin'}`

    const mgr = getWhatsAppManager(workspaceId)
    if (!mgr.isConnected()) throw new ApiError(409, 'WhatsApp no está conectado')

    const content: Record<string, unknown> =
      kind === 'image' ? { image: buffer, caption: caption || undefined }
      : kind === 'video' ? { video: buffer, caption: caption || undefined }
      : kind === 'audio' ? { audio: buffer, mimetype: mime, ptt: false }
      : { document: buffer, fileName, mimetype: mime, caption: caption || undefined }

    const sent = await mgr.sendMessageRaw(`${phone}@s.whatsapp.net`, content)
    if (!sent.success) throw new ApiError(502, `No se pudo enviar: ${sent.error || 'error de WhatsApp'}`)

    const label = kind === 'image' ? '📷 Imagen' : kind === 'video' ? '🎥 Video' : kind === 'audio' ? '🎤 Audio' : `📄 ${fileName}`
    const msg = await db.message.create({
      data: {
        conversationId, content: caption || label, type: kind,
        direction: 'outbound', senderType: 'human', senderId: session.userId,
        status: 'sent', externalId: sent.id || null,
        metadata: JSON.stringify({ source: 'operator-media', kind, fileName, mime }),
      },
    })
    await saveUploadedFile(buffer, fileName, mime, { workspaceId, conversationId, messageId: msg.id, caption }).catch(() => null)
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: (caption || label).slice(0, 100) },
    }).catch(() => {})

    return Response.json({ success: true, messageId: msg.id, kind })
  } catch (error) {
    return errorResponse(error)
  }
}
