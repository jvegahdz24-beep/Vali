// GET /api/meli/listings?workspaceId=&sync=1 — publicaciones del workspace (+sync opcional)
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { loadConnection, meliApi } from '@/lib/meli/client'
import { logMeli } from '@/lib/meli/log'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')!
    await requireWorkspace(workspaceId, session.userId)

    if (searchParams.get('sync') === '1') {
      const conn = await loadConnection(workspaceId)
      if (conn?.status === 'connected') {
        const listings = await db.meliListing.findMany({ where: { workspaceId } })
        for (const l of listings) {
          try {
            const it = await meliApi.getItem(conn, l.meliItemId) as { status?: string; price?: number; available_quantity?: number; sold_quantity?: number; permalink?: string }
            await db.meliListing.update({ where: { id: l.id }, data: { status: it.status || l.status, price: it.price ?? l.price, availableQuantity: it.available_quantity ?? l.availableQuantity, soldQuantity: it.sold_quantity ?? l.soldQuantity, permalink: it.permalink ?? l.permalink, lastSyncedAt: new Date() } })
          } catch { /* una publicación que falla no rompe el resto */ }
        }
        await logMeli(workspaceId, 'sync', { targetType: 'listing', status: 'ok', message: `Sincronizadas ${listings.length} publicaciones` })
      }
    }

    const items = await db.meliListing.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } })
    return Response.json({ items })
  } catch (error) { return errorResponse(error) }
}
