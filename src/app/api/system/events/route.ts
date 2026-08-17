// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — System Events API
// GET  → estadísticas mínimas del event bus del proceso
// POST → replay no disponible sin almacenamiento durable
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAuth, requirePermission, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { eventBus } from '@/lib/event-bus'
import { getRegisteredListenerCount, registerEventSubscribers } from '@/lib/event-bus-subscribers'

async function authorizeDeveloperTools(request: NextRequest) {
  const session = await requireAuth(request)
  if (!session.workspaceId) {
    throw new ApiError(400, 'workspaceId es requerido', 'WORKSPACE_REQUIRED')
  }
  const member = await requireWorkspace(session.workspaceId, session.userId)
  requirePermission(member.role, 'settings.advanced')
  return session
}

export async function GET(request: NextRequest) {
  try {
    await authorizeDeveloperTools(request)
    registerEventSubscribers()

    return NextResponse.json({
      success: true,
      data: {
        // El bus actual es process-local; no se presenta como un log histórico.
        scope: 'process',
        listeners: { registeredCount: getRegisteredListenerCount() },
        dlq: { size: eventBus.getDLQSize() },
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    return errorResponse(error, 'No se pudieron consultar los eventos del sistema')
  }
}

export async function POST(request: NextRequest) {
  try {
    await authorizeDeveloperTools(request)
    return NextResponse.json(
      {
        success: false,
        error: 'El replay de eventos está deshabilitado: no existe almacenamiento durable configurado.',
        code: 'EVENT_REPLAY_UNAVAILABLE',
      },
      { status: 501 },
    )
  } catch (error) {
    return errorResponse(error, 'No se pudo procesar la operación de eventos')
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
