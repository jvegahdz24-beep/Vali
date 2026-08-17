// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — gBrain: base de conocimiento unificada del negocio.
// GET  /api/gbrain?workspaceId=  → catálogo + tono + datos negocio + lecciones + agentes
// PATCH /api/gbrain              → edita tono y datos del negocio (settings + agent_profile)
// "gBrain" no es una tabla: consolida CatalogItem + settings + agent_profile +
// AiTrainingExample + AgentInstance en una sola vista/edición.
// RBAC: GET requiere acceso al workspace; PATCH requiere crm.write.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'

function parse(json: string | null | undefined): Record<string, unknown> {
  try { return JSON.parse(json || '{}') as Record<string, unknown> } catch { return {} }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)

    const now = new Date()
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const convWhere = { conversation: { workspaceId } }
    const [
      ws, catalogCount, catalogSample, profileMod, lessons, agents,
      messages, contacts, deals, documents, appointments, profiles, events,
      msg30, msgPrev, contact30, contactPrev, deal30, dealPrev,
      recentEvents,
    ] = await Promise.all([
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, settings: true } }),
      db.catalogItem.count({ where: { workspaceId } }),
      db.catalogItem.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 8, select: { name: true, price: true, currency: true, category: true } }),
      db.workspaceModule.findFirst({ where: { workspaceId, moduleType: 'agent_profile' } }),
      db.aiTrainingExample.count({ where: { workspaceId, isActive: true } }).catch(() => 0),
      db.agentInstance.findMany({ where: { workspaceId }, orderBy: { totalMessagesSent: 'desc' }, select: { id: true, name: true, vertical: true, status: true, totalMessagesSent: true } }),
      // Conteos reales por capa
      db.message.count({ where: convWhere }).catch(() => 0),
      db.contact.count({ where: { workspaceId } }).catch(() => 0),
      db.deal.count({ where: { workspaceId } }).catch(() => 0),
      db.mediaFile.count({ where: { workspaceId } }).catch(() => 0),
      db.appointment.count({ where: { workspaceId } }).catch(() => 0),
      db.leadProfile.count({ where: { contact: { workspaceId } } }).catch(() => 0),
      db.engineEvent.count({ where: { workspaceId } }).catch(() => 0),
      // Deltas 30d vs 30d previos (reales)
      db.message.count({ where: { ...convWhere, createdAt: { gte: d30 } } }).catch(() => 0),
      db.message.count({ where: { ...convWhere, createdAt: { gte: d60, lt: d30 } } }).catch(() => 0),
      db.contact.count({ where: { workspaceId, createdAt: { gte: d30 } } }).catch(() => 0),
      db.contact.count({ where: { workspaceId, createdAt: { gte: d60, lt: d30 } } }).catch(() => 0),
      db.deal.count({ where: { workspaceId, createdAt: { gte: d30 } } }).catch(() => 0),
      db.deal.count({ where: { workspaceId, createdAt: { gte: d60, lt: d30 } } }).catch(() => 0),
      // Línea de tiempo cognitiva (eventos reales)
      db.engineEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, type: true, createdAt: true, contactId: true, metadata: true } }).catch(() => []),
    ])
    const s = parse(ws?.settings)
    const profileCfg = profileMod ? parse(profileMod.config) : {}
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0))
    // Integraciones conectadas (reales, por settings)
    let integrations = 0
    if (s.mercadoLibre || s.meli) integrations++
    if ((s.apiKeys as Record<string, unknown>)?.groq || (s.apiKeys as Record<string, unknown>)?.openai) integrations++
    if (s.telegramBotToken || (s.telegram as Record<string, unknown>)?.botToken) integrations++
    integrations++ // WhatsApp (canal base)
    const totalKnowledge = messages + contacts + deals + documents + catalogCount + lessons + appointments

    return Response.json({
      businessName: ws?.name || '',
      catalog: { count: catalogCount, items: catalogSample },
      tone: (profileCfg.tone as string) || '',
      greeting: (profileCfg.greeting as string) || '',
      hasCustomPrompt: !!s.customSystemPrompt,
      business: {
        businessHours: (s.businessHours as string) || '',
        businessAddress: (s.businessAddress as string) || '',
        businessPhone: (s.businessPhone as string) || '',
        timezone: (s.timezone as string) || '',
        appointmentUrl: (s.appointmentUrl as string) || '',
      },
      lessons,
      agents,
      stats: {
        totalKnowledge, messages, contacts, deals, documents, appointments, profiles, events,
        catalog: catalogCount, lessons, integrations,
        activeAgents: agents.filter((a) => a.status === 'activo').length,
        totalMessagesSent: agents.reduce((n, a) => n + (a.totalMessagesSent || 0), 0),
        deltas: { messages: pct(msg30, msgPrev), contacts: pct(contact30, contactPrev), deals: pct(deal30, dealPrev) },
      },
      timeline: recentEvents,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as {
      workspaceId: string
      tone?: string; greeting?: string
      businessHours?: string; businessAddress?: string; businessPhone?: string; timezone?: string; appointmentUrl?: string
    }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    const ws = await db.workspace.findUnique({ where: { id: body.workspaceId }, select: { settings: true } })
    if (!ws) throw new ApiError(404, 'Workspace no encontrado')
    const s = parse(ws.settings)

    // Datos del negocio → settings
    for (const k of ['businessHours', 'businessAddress', 'businessPhone', 'timezone', 'appointmentUrl'] as const) {
      if (typeof body[k] === 'string') s[k] = body[k]
    }
    await db.workspace.update({ where: { id: body.workspaceId }, data: { settings: JSON.stringify(s) } })

    // Tono/saludo → módulo agent_profile (lo inyecta composePrompt)
    if (typeof body.tone === 'string' || typeof body.greeting === 'string') {
      const mod = await db.workspaceModule.findFirst({ where: { workspaceId: body.workspaceId, moduleType: 'agent_profile' } })
      const cfg = mod ? parse(mod.config) : {}
      if (typeof body.tone === 'string') cfg.tone = body.tone
      if (typeof body.greeting === 'string') cfg.greeting = body.greeting
      if (mod) await db.workspaceModule.update({ where: { id: mod.id }, data: { config: JSON.stringify(cfg), enabled: true } })
      else await db.workspaceModule.create({ data: { workspaceId: body.workspaceId, moduleType: 'agent_profile', enabled: true, config: JSON.stringify(cfg) } })
    }

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
