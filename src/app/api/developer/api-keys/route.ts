// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Developer API Keys Endpoint
// GET /api/developer/api-keys — Retrieve API keys from workspace settings
// PUT /api/developer/api-keys — Save API keys to workspace settings
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    await requireWorkspace(workspaceId!, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId! },
      select: { settings: true },
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
    const connectionSettings = (settings.connection as Record<string, unknown>) || {}

    // Mask keys for security — only show last 4 characters
    const maskedKeys: Record<string, string> = {}
    for (const [provider, key] of Object.entries(apiKeys)) {
      if (key && key.length > 8) {
        maskedKeys[provider] = '••••' + key.slice(-4)
      } else if (key) {
        maskedKeys[provider] = '••••'
      }
    }

    return Response.json({
      success: true,
      maskedKeys,
      connection: connectionSettings,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, apiKeys, baseUrl, timeout, retryCount } = body

    await requireWorkspace(workspaceId, session.userId)

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
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

    // Update API keys
    if (apiKeys) {
      // Merge with existing keys so we don't lose keys not being updated
      const existingKeys = (settings.apiKeys as Record<string, string>) || {}
      settings.apiKeys = { ...existingKeys, ...apiKeys }
    }

    // Update connection settings
    if (baseUrl !== undefined || timeout !== undefined || retryCount !== undefined) {
      const existingConn = (settings.connection as Record<string, unknown>) || {}
      settings.connection = {
        ...existingConn,
        ...(baseUrl !== undefined && { baseUrl }),
        ...(timeout !== undefined && { timeout }),
        ...(retryCount !== undefined && { retryCount }),
      }
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
