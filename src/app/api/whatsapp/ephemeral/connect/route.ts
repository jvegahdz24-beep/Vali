// ═══════════════════════════════════════════════════════════════
// POST /api/whatsapp/ephemeral/connect
// Create a new ephemeral WhatsApp session
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req)

    const body = await req.json().catch(() => ({}))
    const { timeoutMs, maxLifetimeMs } = body || {}

    const client = await ephemeralManager.create({
      timeoutMs: timeoutMs || undefined,
      maxLifetimeMs: maxLifetimeMs || undefined,
      printQR: false,
    })

    const status = await client.connect()

    return NextResponse.json({
      success: true,
      clientId: client.id,
      status,
      message: status.connecting
        ? `Sesion efimera ${client.id} iniciada. Escanea el QR.`
        : 'Sesion creada',
    })
  } catch (error) {
    return errorResponse(error, 'Error al crear sesion efimera')
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req)

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (clientId) {
      const client = ephemeralManager.get(clientId)
      if (!client) {
        return NextResponse.json({ success: false, error: 'Sesion no encontrada o destruida' }, { status: 404 })
      }
      return NextResponse.json({ success: true, client: client.getStatus() })
    }

    const sessions = ephemeralManager.list()
    return NextResponse.json({ success: true, sessions, count: sessions.length })
  } catch (error) {
    return errorResponse(error, 'Error al obtener sesiones')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req)

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (clientId) {
      const destroyed = await ephemeralManager.destroy(clientId)
      return NextResponse.json({
        success: true,
        destroyed,
        message: destroyed ? `Sesion ${clientId} destruida` : 'Sesion no encontrada',
      })
    }

    await ephemeralManager.destroyAll()
    return NextResponse.json({ success: true, message: 'Todas las sesiones destruidas' })
  } catch (error) {
    return errorResponse(error, 'Error al destruir sesion')
  }
}
