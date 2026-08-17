// GET /api/meli/orders?workspaceId=         — ventas/órdenes recientes
// GET /api/meli/orders?workspaceId=&id=XXX  — detalle de una orden (+ envío)
// RBAC: membresía.
import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { loadConnection, meliApi } from '@/lib/meli/client'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')!
    await requireWorkspace(workspaceId, session.userId)
    const conn = await loadConnection(workspaceId)
    if (!conn || conn.status !== 'connected') return Response.json({ connected: false, orders: [] })

    const id = searchParams.get('id')
    if (id) {
      const order = await meliApi.order(conn, id) as { shipping?: { id?: string } }
      let shipment: unknown = null
      const shipId = order?.shipping?.id
      if (shipId) { try { shipment = await meliApi.shipment(conn, String(shipId)) } catch { /* ignore */ } }
      return Response.json({ connected: true, order, shipment })
    }

    const data = await meliApi.orders(conn) as { results?: unknown[] }
    return Response.json({ connected: true, orders: data.results || [] })
  } catch (error) { return errorResponse(error) }
}
