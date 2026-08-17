// Publicar creativo al ESTADO de WhatsApp (F7, 2026-07-22).
// POST { workspaceId, carId, template?, caption? } → renderiza el creativo del
// auto y lo publica en el Estado de WhatsApp (lo ven los contactos del negocio).
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { getWhatsAppManager } from '@/lib/whatsapp/connection'
import { generateCaption } from '@/lib/marketing/caption'
import { buildCarCreative } from '@/lib/marketing/creative'

function localBase(): string { return `http://127.0.0.1:${process.env.PORT || 3105}` }

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, carId, template, caption } = await req.json() as { workspaceId: string; carId: string; template?: string; caption?: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!carId) throw new ApiError(400, 'Falta el auto')

    const mgr = getWhatsAppManager(workspaceId)
    if (!mgr.isConnected()) throw new ApiError(503, 'WhatsApp no está conectado')

    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) throw new ApiError(404, 'Auto no encontrado')

    // Imagen: el mismo render de creativos (formato historia = vertical, ideal para estado)
    const tpl = template || 'historia'
    const imageUrl = `${localBase()}/api/marketing/render?workspaceId=${workspaceId}&carId=${carId}&format=story&template=${tpl}`

    // Caption: la que mande el usuario o una generada
    let text = (caption || '').trim()
    if (!text) {
      try { const c = await generateCaption(buildCarCreative(item, ws, localBase()), 'instagram'); text = c.text } catch { text = item.name }
    }

    // Destinatarios: contactos con teléfono real (no web:/lid)
    const contacts = await db.contact.findMany({
      where: { workspaceId, phone: { not: null } },
      select: { phone: true }, take: 1000,
    })
    const jids = contacts
      .map((c) => (c.phone || '').replace(/\D/g, ''))
      .filter((p) => p.length >= 10 && p.length <= 15)
      .map((p) => `${p}@s.whatsapp.net`)
    if (!jids.length) throw new ApiError(400, 'No hay contactos con teléfono para mostrar el estado')

    const r = await mgr.sendStatus(imageUrl, text, jids)
    if (!r.success) return Response.json({ success: false, error: r.error }, { status: 502 })
    return Response.json({ success: true, id: r.id, recipients: Math.min(jids.length, 500) })
  } catch (error) { return errorResponse(error) }
}
