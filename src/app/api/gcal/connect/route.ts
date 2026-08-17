// GET /api/gcal/connect?workspaceId= — inicia OAuth de Google Calendar para el
// USUARIO logueado (cada quien conecta SU cuenta). GET con ?status=1 — estado.
// DELETE — desconecta MI cuenta (o la de negocio legada si no tengo propia).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse, ApiError } from '@/lib/api-auth'
import { gcalAppReady, gcalAuthUrl, gcalState, readGCal, readGCalUsers, gcalConnected, gcalDisconnect, gcalDisconnectUser } from '@/lib/gcal'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    if (req.nextUrl.searchParams.get('status')) {
      const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
      const legacy = readGCal(ws?.settings)
      const users = readGCalUsers(ws?.settings)
      const mine = users[session.userId]
      const mineConnected = !!(mine && gcalConnected(mine))
      const teamConnected = Object.values(users).filter((c) => gcalConnected(c)).length + (gcalConnected(legacy) ? 1 : 0)
      return Response.json({
        appReady: gcalAppReady(),
        // connected = MI conexión (el botón es personal); email = mi cuenta
        connected: mineConnected || (!Object.keys(users).length && gcalConnected(legacy)),
        email: mineConnected ? (mine?.email || null) : (gcalConnected(legacy) ? legacy.email || null : null),
        mineConnected,
        teamConnected,
      })
    }
    if (!gcalAppReady()) throw new ApiError(400, 'La integración con Google aún no está activada en el servidor. El administrador debe crear la app en Google Cloud (una sola vez) y poner GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET en el .env.')
    // state firmado ata la conexión a ESTE usuario y workspace
    return NextResponse.redirect(gcalAuthUrl(gcalState(workspaceId, session.userId)))
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } })
    const users = readGCalUsers(ws?.settings)
    if (users[session.userId]) await gcalDisconnectUser(workspaceId, session.userId)
    else await gcalDisconnect(workspaceId)
    return Response.json({ success: true })
  } catch (error) { return errorResponse(error) }
}
