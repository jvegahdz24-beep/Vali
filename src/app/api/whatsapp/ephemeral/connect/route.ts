// ═══════════════════════════════════════════════════════════════
// POST /api/whatsapp/ephemeral/connect
// Create a new ephemeral WhatsApp session
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { ephemeralManager } from '@/lib/whatsapp/ephemeral-client'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session', code: 'WORKSPACE_REQUIRED' }, { status: 400 })
    }
    await requireWorkspace(session.workspaceId, session.userId)

    const activeSessions = ephemeralManager.list({ ownerId: session.userId, workspaceId: session.workspaceId })
    if (activeSessions.length >= 2) {
      return NextResponse.json({ error: 'Límite de sesiones efímeras alcanzado', code: 'SESSION_LIMIT' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const parseDuration = (value: unknown, fallback: number, max: number): number => {
      if (value === undefined || value === null || value === '') return fallback
      const parsed = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(parsed) || parsed < 60_000 || parsed > max) {
        throw new Error('timeoutMs/maxLifetimeMs fuera de rango')
      }
      return Math.floor(parsed)
    }
    const timeoutMs = parseDuration(body.timeoutMs, 30 * 60 * 1000, 30 * 60 * 1000)
    const maxLifetimeMs = parseDuration(body.maxLifetimeMs, 2 * 60 * 60 * 1000, 2 * 60 * 60 * 1000)

    const client = await ephemeralManager.create({
      timeoutMs,
      maxLifetimeMs,
      printQR: false,
      ownerId: session.userId,
      workspaceId: session.workspaceId,
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
    const message = error instanceof Error ? error.message : ''
    if (message.includes('fuera de rango')) {
      return NextResponse.json({ error: message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    return errorResponse(error, 'Error al crear sesion efimera')
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session', code: 'WORKSPACE_REQUIRED' }, { status: 400 })
    }
    await requireWorkspace(session.workspaceId, session.userId)

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (clientId) {
      const client = ephemeralManager.get(clientId, { ownerId: session.userId, workspaceId: session.workspaceId })
      if (!client) {
        return NextResponse.json({ success: false, error: 'Sesion no encontrada o destruida' }, { status: 404 })
      }
      return NextResponse.json({ success: true, client: client.getStatus() })
    }

    const sessions = ephemeralManager.list({ ownerId: session.userId, workspaceId: session.workspaceId })
    return NextResponse.json({ success: true, sessions, count: sessions.length })
  } catch (error) {
    return errorResponse(error, 'Error al obtener sesiones')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session.workspaceId) {
      return NextResponse.json({ error: 'No workspace in session', code: 'WORKSPACE_REQUIRED' }, { status: 400 })
    }
    await requireWorkspace(session.workspaceId, session.userId)

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (clientId) {
      const destroyed = await ephemeralManager.destroy(clientId, { ownerId: session.userId, workspaceId: session.workspaceId })
      return NextResponse.json({
        success: true,
        destroyed,
        message: destroyed ? `Sesion ${clientId} destruida` : 'Sesion no encontrada',
      })
    }

    await ephemeralManager.destroyAll({ ownerId: session.userId, workspaceId: session.workspaceId })
    return NextResponse.json({ success: true, message: 'Todas las sesiones destruidas' })
  } catch (error) {
    return errorResponse(error, 'Error al destruir sesion')
  }
}
