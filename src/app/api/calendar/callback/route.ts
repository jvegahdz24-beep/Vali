// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — GET /api/calendar/callback
// Handles the Google OAuth2 redirect after user grants consent.
// Exchanges the auth code for tokens, stores them in workspace
// settings, and redirects to the dashboard.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logError, logOk } from '@/lib/logger'
import { exchangeCode } from '@/lib/calendar/google-calendar'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // workspaceId

    if (!code || !state) {
      logError('CORE', 'calendar/callback', new Error('Missing code or state'))
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      return Response.redirect(`${baseUrl}/dashboard?calendar=error`)
    }

    const workspaceId = state

    // Exchange code for tokens
    const tokens = await exchangeCode(code)

    // Read existing workspace settings
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    })

    if (!workspace) {
      logError('CORE', 'calendar/callback', new Error('Workspace not found'), { workspaceId })
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      return Response.redirect(`${baseUrl}/dashboard?calendar=error`)
    }

    // Merge tokens into workspace settings
    let existingSettings: Record<string, unknown> = {}
    try {
      existingSettings = JSON.parse(workspace.settings) as Record<string, unknown>
    } catch {
      // settings may be empty or malformed — start fresh
    }

    const updatedSettings = {
      ...existingSettings,
      googleCalendar: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
      },
    }

    await db.workspace.update({
      where: { id: workspaceId },
      data: { settings: JSON.stringify(updatedSettings) },
    })

    logOk('CORE', 'calendar/callback', { workspaceId })

    // Redirect to dashboard with success flag
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return Response.redirect(`${baseUrl}/dashboard?calendar=connected`)
  } catch (error) {
    logError('CORE', 'calendar/callback', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return Response.redirect(`${baseUrl}/dashboard?calendar=error`)
  }
}
