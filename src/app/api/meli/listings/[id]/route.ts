// PATCH  /api/meli/listings/:id — pausar/reactivar/actualizar (precio, stock)
// DELETE /api/meli/listings/:id — cerrar publicación en ML
// :id = id de MeliListing (local). RBAC: crm.write.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { loadConnection, meliApi } from '@/lib/meli/client'
import { logMeli } from '@/lib/meli/log'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const body = await req.json() as { action?: 'pause' | 'activate' | 'update'; price?: number; availableQuantity?: number }
    const listing = await db.meliListing.findUnique({ where: { id } })
    if (!listing) throw new ApiError(404, 'Publicación no encontrada')
    const member = await requireWorkspace(listing.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    const conn = await loadConnection(listing.workspaceId)
    if (!conn || conn.status !== 'connected') throw new ApiError(400, 'Mercado Libre no conectado')

    const payload: Record<string, unknown> = {}
    if (body.action === 'pause') payload.status = 'paused'
    if (body.action === 'activate') payload.status = 'active'
    if (typeof body.price === 'number') payload.price = body.price
    if (typeof body.availableQuantity === 'number') payload.available_quantity = body.availableQuantity
    if (Object.keys(payload).length === 0) throw new ApiError(400, 'Nada que actualizar')

    try {
      const updated = await meliApi.updateItem(conn, listing.meliItemId, payload) as { status?: string; price?: number; available_quantity?: number }
      const saved = await db.meliListing.update({ where: { id }, data: { status: updated.status || listing.status, price: updated.price ?? listing.price, availableQuantity: updated.available_quantity ?? listing.availableQuantity, lastSyncedAt: new Date() } })
      await logMeli(listing.workspaceId, body.action || 'update', { targetType: 'listing', targetId: listing.meliItemId, status: 'ok', message: `${listing.title}: ${body.action || 'actualizado'}` })
      return Response.json({ success: true, listing: saved })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      await logMeli(listing.workspaceId, body.action || 'update', { targetType: 'listing', targetId: listing.meliItemId, status: 'error', message: msg })
      throw new ApiError(422, msg)
    }
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req)
    const { id } = await params
    const listing = await db.meliListing.findUnique({ where: { id } })
    if (!listing) throw new ApiError(404, 'Publicación no encontrada')
    const member = await requireWorkspace(listing.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    const conn = await loadConnection(listing.workspaceId)
    if (conn?.status === 'connected') {
      // ML no permite borrar; se pausa y luego se cierra.
      try { await meliApi.updateItem(conn, listing.meliItemId, { status: 'paused' }) } catch { /* ignore */ }
      try { await meliApi.updateItem(conn, listing.meliItemId, { status: 'closed' }) } catch (e) {
        await logMeli(listing.workspaceId, 'delete', { targetType: 'listing', targetId: listing.meliItemId, status: 'error', message: e instanceof Error ? e.message : 'Error al cerrar' })
      }
    }
    await db.meliListing.delete({ where: { id } })
    await logMeli(listing.workspaceId, 'delete', { targetType: 'listing', targetId: listing.meliItemId, status: 'ok', message: `Publicación cerrada: ${listing.title}` })
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
