// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — gBrain Agent Factory: Templates API
// GET  /api/agent-factory/templates?workspaceId=  — registry (base) + custom del workspace
// POST /api/agent-factory/templates               — crea una plantilla custom (DB)
//
// Namespace propio (/agent-factory) para no colisionar con el sistema previo
// de plantillas en /api/agents/templates (que siembra AgentPersona).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { TEMPLATE_REGISTRY } from '@/lib/templates/agent-templates'
import { isConversationalVertical } from '@/lib/agent-verticals'

interface TemplateDTO {
  id: string
  source: 'registry' | 'custom'
  name: string
  vertical: string
  description: string
  systemPrompt: string
  tools: string[]
  qualityChecklist: string[]
  humanApprovalGates: string[]
  forbiddenActions: string[]
  keywords: string[]
  version: string
  editable: boolean
  // live = atiende conversaciones de WhatsApp (se ejecuta). false = back-office
  // sin runtime todavía ("Próximamente / requiere integración").
  live: boolean
}

function safeArr(json: string | null | undefined): string[] {
  if (!json) return []
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    await requireWorkspace(workspaceId!, session.userId)

    // Plantillas base del registry de código (solo lectura)
    const registry: TemplateDTO[] = TEMPLATE_REGISTRY.map((t) => ({
      id: t.id,
      source: 'registry',
      name: t.name,
      vertical: t.vertical,
      description: t.description,
      systemPrompt: t.systemPrompt,
      tools: t.tools ?? [],
      qualityChecklist: t.qualityChecklist ?? [],
      humanApprovalGates: t.humanApprovalGates ?? [],
      forbiddenActions: [],
      keywords: [],
      version: t.version ?? '1.0.0',
      editable: false,
      live: isConversationalVertical(t.vertical),
    }))

    // Plantillas custom del workspace + globales en DB
    const dbTemplates = await db.agentTemplate.findMany({
      where: { OR: [{ workspaceId: workspaceId! }, { isGlobal: true }] },
      orderBy: { createdAt: 'desc' },
    })
    const custom: TemplateDTO[] = dbTemplates.map((t) => ({
      id: t.id,
      source: 'custom',
      name: t.name,
      vertical: t.vertical,
      description: t.description,
      systemPrompt: t.systemPrompt,
      tools: safeArr(t.tools),
      qualityChecklist: safeArr(t.qualityChecklist),
      humanApprovalGates: safeArr(t.humanApprovalGates),
      forbiddenActions: safeArr(t.forbiddenActions),
      keywords: safeArr(t.keywords),
      version: t.version,
      editable: !t.isGlobal,
      live: isConversationalVertical(t.vertical),
    }))

    return NextResponse.json({ templates: [...custom, ...registry] })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      workspaceId: string
      name: string
      vertical?: string
      description?: string
      systemPrompt: string
      tools?: string[]
      qualityChecklist?: string[]
      humanApprovalGates?: string[]
      forbiddenActions?: string[]
      keywords?: string[]
    }
    await requireWorkspace(body.workspaceId, session.userId)

    if (!body.name?.trim() || !body.systemPrompt?.trim()) {
      return NextResponse.json({ error: 'name y systemPrompt son requeridos' }, { status: 400 })
    }

    const tmpl = await db.agentTemplate.create({
      data: {
        name: body.name.trim(),
        vertical: body.vertical || 'custom',
        description: body.description || '',
        systemPrompt: body.systemPrompt,
        tools: JSON.stringify(body.tools ?? []),
        qualityChecklist: JSON.stringify(body.qualityChecklist ?? []),
        humanApprovalGates: JSON.stringify(body.humanApprovalGates ?? []),
        forbiddenActions: JSON.stringify(body.forbiddenActions ?? []),
        keywords: JSON.stringify(body.keywords ?? []),
        isGlobal: false,
        workspaceId: body.workspaceId,
      },
    })

    return NextResponse.json({ template: { id: tmpl.id } }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
