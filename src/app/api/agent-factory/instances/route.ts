// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — gBrain Agent Factory: Instances API
// GET  /api/agent-factory/instances?workspaceId=  — agentes instanciados del workspace
// POST /api/agent-factory/instances               — instancia un agente (1 clic)
//
// La instanciación toma una plantilla (registry o custom), reemplaza los
// placeholders {{var}} y crea un AgentInstance vinculado al workspace.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { TEMPLATE_REGISTRY, instantiateTemplate, type AgentTemplate, type VerticalType } from '@/lib/templates/agent-templates'
import { invalidateAgentInstanceCache, defaultKeywordsForVertical } from '@/lib/ai/agent-selector'

function safeArr(json: string | null | undefined): string[] {
  if (!json) return []
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}

// vertical → rol por defecto (usado por el router para boosts de score/etapa)
const VERTICAL_ROLE: Record<string, string> = {
  ventas: 'CLOSER',
  seguimiento: 'FOLLOWUP',
  seguros: 'SEGURO',
  financiamiento: 'FINAN',
  precalificacion: 'PRECALIF',
  cotizador: 'COTIZADOR',
  'planes-pago': 'PLANES',
  'recordatorio-pagos': 'RECORDATORIO',
  soporte: 'SOPORTE',
  logistica: 'LOGISTICA',
  inventario: 'INVENTARIO',
}

function roleForVertical(vertical: string): string {
  return VERTICAL_ROLE[vertical] || vertical.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    const rows = await db.agentInstance.findMany({
      where: { workspaceId: workspaceId! },
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { name: true } } },
    })

    const instances = rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      vertical: r.vertical,
      scope: r.scope,
      forbiddenActions: safeArr(r.forbiddenActions),
      systemPrompt: r.systemPrompt,
      tools: safeArr(r.tools),
      keywords: safeArr(r.keywords),
      stageMatch: safeArr(r.stageMatch),
      model: r.model,
      temperature: r.temperature,
      priority: r.priority,
      status: r.status,
      totalMessagesSent: r.totalMessagesSent,
      templateId: r.templateId,
      templateName: r.template?.name ?? null,
      createdAt: r.createdAt,
    }))

    return NextResponse.json({ instances })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      workspaceId: string
      templateId: string
      name?: string
      role?: string
      variables?: Record<string, string>
      keywords?: string[]
      stageMatch?: string[]
      tools?: string[]
      temperature?: number
      model?: string
      priority?: number
    }
    await requireWorkspace(body.workspaceId, session.userId)

    if (!body.templateId) {
      return NextResponse.json({ error: 'templateId es requerido' }, { status: 400 })
    }

    // Resolver la plantilla: primero en el registry de código, luego en DB.
    let base: AgentTemplate | null = TEMPLATE_REGISTRY.find((t) => t.id === body.templateId) ?? null
    let forbiddenActions: string[] = []

    if (!base) {
      const dbT = await db.agentTemplate.findUnique({ where: { id: body.templateId } })
      if (!dbT || (dbT.workspaceId !== body.workspaceId && !dbT.isGlobal)) {
        return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
      }
      base = {
        id: dbT.id,
        name: dbT.name,
        vertical: dbT.vertical as VerticalType,
        description: dbT.description,
        systemPrompt: dbT.systemPrompt,
        tools: safeArr(dbT.tools),
        exampleDialogues: [],
        qualityChecklist: safeArr(dbT.qualityChecklist),
        humanApprovalGates: safeArr(dbT.humanApprovalGates),
        customizationPercent: 25,
        version: dbT.version,
      }
      forbiddenActions = safeArr(dbT.forbiddenActions)
    }

    // Reemplazar placeholders {{var}} con las variables del cliente.
    const resolved = body.variables && Object.keys(body.variables).length > 0
      ? instantiateTemplate(base, body.variables)
      : base

    const onlyDbTemplate = TEMPLATE_REGISTRY.every((t) => t.id !== body.templateId)

    const created = await db.agentInstance.create({
      data: {
        name: body.name?.trim() || resolved.name,
        role: body.role || roleForVertical(base.vertical),
        vertical: base.vertical,
        scope: resolved.description || '',
        forbiddenActions: JSON.stringify(forbiddenActions),
        systemPrompt: resolved.systemPrompt,
        tools: JSON.stringify(body.tools ?? base.tools ?? []),
        // Si el cliente no define keywords, usa las del vertical para que el
        // agente conversacional realmente rutee (los back-office quedan en []).
        keywords: JSON.stringify(
          body.keywords?.length ? body.keywords : defaultKeywordsForVertical(base.vertical),
        ),
        stageMatch: JSON.stringify(body.stageMatch ?? []),
        model: body.model || 'glm-4.5-flash',
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
        priority: typeof body.priority === 'number' ? body.priority : 100,
        status: 'activo',
        // Solo enlaza templateId si es una plantilla persistida en DB.
        templateId: onlyDbTemplate ? body.templateId : null,
        workspaceId: body.workspaceId,
      },
    })

    invalidateAgentInstanceCache(body.workspaceId)
    return NextResponse.json({ instance: { id: created.id } }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
