// ═══════════════════════════════════════════════════════════════
// Configuración de canales Meta (Instagram/Facebook) por workspace.
// GET    — estado + datos (token enmascarado)
// POST   — guarda/actualiza { pageId, pageName, igAccountId, pageAccessToken, verifyToken }
// DELETE — desconecta
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'

function mask(t?: string | null) { if (!t) return null; return t.length > 10 ? `${t.slice(0, 6)}…${t.slice(-4)}` : '••••' }

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    const ch = await db.metaChannel.findFirst({ where: { workspaceId } })
    const webhookUrl = 'https://valiautoflow.com/api/webhooks/meta'
    return NextResponse.json({
      success: true,
      connected: !!ch?.isActive,
      webhookUrl,
      channel: ch ? { pageId: ch.pageId, pageName: ch.pageName, igAccountId: ch.igAccountId, verifyToken: ch.verifyToken, tokenMasked: mask(ch.pageAccessToken), isActive: ch.isActive } : null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId, pageId, pageName, igAccountId, pageAccessToken, verifyToken } = body
    await requireWorkspace(workspaceId, session.userId)
    if (!pageId || !pageAccessToken || !verifyToken) {
      return NextResponse.json({ error: 'Se requiere pageId, pageAccessToken y verifyToken' }, { status: 400 })
    }

    // Evita robar una página ya vinculada a OTRO workspace (multi-tenant).
    const clash = await db.metaChannel.findUnique({ where: { pageId } })
    if (clash && clash.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Esa página de Facebook ya está conectada a otra cuenta.' }, { status: 409 })
    }

    const existing = await db.metaChannel.findFirst({ where: { workspaceId } })
    const data = { workspaceId, pageId, pageName: pageName || null, igAccountId: igAccountId || null, pageAccessToken, verifyToken, isActive: true }
    const ch = existing
      ? await db.metaChannel.update({ where: { id: existing.id }, data })
      : await db.metaChannel.create({ data })
    return NextResponse.json({ success: true, connected: true, pageId: ch.pageId })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const workspaceId = req.nextUrl.searchParams.get('workspaceId') || ''
    await requireWorkspace(workspaceId, session.userId)
    await db.metaChannel.deleteMany({ where: { workspaceId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
