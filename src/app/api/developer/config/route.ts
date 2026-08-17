// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Developer Config Endpoint
// GET /api/developer/config — Workspace environment & config info
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId') || ''

    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        industry: true,
        maxContacts: true,
        maxAgents: true,
        maxConversations: true,
        whatsappPhoneId: true,
        waChannel: true,
        settings: true,
        createdAt: true,
      },
    })

    if (!workspace) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 })
    }

    let settings: Record<string, unknown> = {}
    try {
      settings = JSON.parse(workspace.settings || '{}')
    } catch {
      settings = {}
    }

    const apiKeys = (settings.apiKeys as Record<string, string>) || {}

    // Mask API keys — show provider:configured status
    const maskedApiKeys: { key: string; val: string; masked: boolean }[] = []
    const providers = ['groq', 'openai', 'deepseek', 'gemini', 'glm']
    for (const provider of providers) {
      const k = apiKeys[provider]
      if (k && k.length > 4) {
        maskedApiKeys.push({
          key: provider.toUpperCase() + '_API_KEY',
          val: k.substring(0, 4) + '••••••••••••',
          masked: true,
        })
      } else if (k) {
        maskedApiKeys.push({ key: provider.toUpperCase() + '_API_KEY', val: '••••', masked: true })
      }
    }

    const envVars = [
      { key: 'WORKSPACE_ID', val: workspace.id, masked: false },
      { key: 'WORKSPACE_SLUG', val: workspace.slug, masked: false },
      { key: 'PLAN', val: workspace.plan, masked: false },
      { key: 'INDUSTRY', val: workspace.industry, masked: false },
      { key: 'NODE_ENV', val: process.env.NODE_ENV || 'development', masked: false },
      { key: 'APP_VERSION', val: process.env.npm_package_version || '0.2.0', masked: false },
      { key: 'WHATSAPP_CHANNEL', val: workspace.whatsappPhoneId ? workspace.waChannel : 'not configured', masked: false },
      ...maskedApiKeys,
    ]

    return Response.json({
      success: true,
      envVars,
      featureFlags: (settings.featureFlags as Record<string, boolean>) ?? null,
      limits: {
        maxContacts: workspace.maxContacts,
        maxAgents: workspace.maxAgents,
        maxConversations: workspace.maxConversations,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/developer/config — Save featureFlags to workspace settings
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, featureFlags } = body

    if (!workspaceId) {
      return Response.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'settings.advanced')

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })
    if (!workspace) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 })
    }

    let settings: Record<string, unknown> = {}
    try { settings = JSON.parse(workspace.settings || '{}') } catch { settings = {} }

    if (featureFlags) {
      settings.featureFlags = featureFlags
    }

    await db.workspace.update({
      where: { id: workspaceId },
      data: { settings: JSON.stringify(settings) },
    })

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
