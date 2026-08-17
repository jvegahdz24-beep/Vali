// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Workspace Modules API
// GET    /api/workspace-modules?workspaceId= — Lista todos los módulos
// POST   /api/workspace-modules — Crea o actualiza un módulo (upsert)
// PATCH  /api/workspace-modules — Toggle enabled de un módulo
// DELETE /api/workspace-modules?id= — Elimina un módulo
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

const VALID_MODULE_TYPES = ['agent_profile', 'physical_location', 'appointments', 'catalog']

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const modules = await db.workspaceModule.findMany({
      where: { workspaceId: workspaceId! },
      orderBy: { moduleType: 'asc' },
    })

    // Ensure all 4 module types exist (return defaults for missing ones)
    const moduleMap = new Map(modules.map((m) => [m.moduleType, m]))
    const allModules = VALID_MODULE_TYPES.map((type) => {
      const existing = moduleMap.get(type)
      if (existing) {
        return {
          ...existing,
          config: safeParseJson(existing.config),
        }
      }
      // Return a virtual default (not persisted until the user saves)
      return {
        id: null,
        workspaceId: workspaceId!,
        moduleType: type,
        enabled: false,
        config: {},
        createdAt: null,
        updatedAt: null,
      }
    })

    return NextResponse.json({ modules: allModules })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      workspaceId: string
      moduleType: string
      enabled?: boolean
      config?: Record<string, unknown>
    }

    const { workspaceId, moduleType, enabled = false, config = {} } = body

    if (!workspaceId || !moduleType) {
      return NextResponse.json({ error: 'workspaceId y moduleType son requeridos' }, { status: 400 })
    }

    if (!VALID_MODULE_TYPES.includes(moduleType)) {
      return NextResponse.json(
        { error: `moduleType inválido. Valores permitidos: ${VALID_MODULE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    const module_ = await db.workspaceModule.upsert({
      where: {
        workspaceId_moduleType: { workspaceId, moduleType },
      },
      update: {
        enabled,
        config: JSON.stringify(config),
        updatedAt: new Date(),
      },
      create: {
        workspaceId,
        moduleType,
        enabled,
        config: JSON.stringify(config),
      },
    })

    return NextResponse.json({
      module: { ...module_, config: safeParseJson(module_.config) },
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      workspaceId: string
      moduleType: string
      enabled: boolean
    }

    const { workspaceId, moduleType, enabled } = body

    if (!workspaceId || !moduleType || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'workspaceId, moduleType y enabled son requeridos' },
        { status: 400 }
      )
    }

    await requireWorkspace(workspaceId, session.userId)

    const module_ = await db.workspaceModule.upsert({
      where: {
        workspaceId_moduleType: { workspaceId, moduleType },
      },
      update: {
        enabled,
        updatedAt: new Date(),
      },
      create: {
        workspaceId,
        moduleType,
        enabled,
        config: '{}',
      },
    })

    return NextResponse.json({
      module: { ...module_, config: safeParseJson(module_.config) },
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
    }

    const existing = await db.workspaceModule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Módulo no encontrado' }, { status: 404 })
    }

    await requireWorkspace(existing.workspaceId, session.userId)
    await db.workspaceModule.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}

function safeParseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}
