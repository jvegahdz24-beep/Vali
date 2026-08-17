// ═══════════════════════════════════════════════════════════════
// WIDGET WEBCHAT EMBEBIBLE — config pública de marca por workspace.
// GET /api/widget/config?ws=<workspaceId>
// Devuelve SOLO datos de presentación (nombre, logo, color, saludo).
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

export async function GET(req: NextRequest) {
  try {
    const ws = req.nextUrl.searchParams.get('ws') || ''
    if (!ws) return NextResponse.json({ error: 'ws requerido' }, { status: 400, headers: CORS })
    const workspace = await db.workspace.findUnique({ where: { id: ws }, select: { id: true, name: true, isActive: true, settings: true } })
    if (!workspace || !workspace.isActive) return NextResponse.json({ error: 'no disponible' }, { status: 404, headers: CORS })
    let s: Record<string, unknown> = {}
    try { s = JSON.parse(workspace.settings || '{}') } catch { /* */ }
    if (s.webWidget === false) return NextResponse.json({ error: 'widget desactivado' }, { status: 404, headers: CORS })
    return NextResponse.json({
      name: workspace.name,
      logo: (s.workspaceLogo as string) || (s.logo as string) || null,
      color: (s.widgetColor as string) || '#7c3aed',
      greeting: (s.widgetGreeting as string) || `¡Hola! 👋 Soy el asesor virtual de ${workspace.name}. ¿En qué te puedo ayudar?`,
    }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } })
  } catch {
    return NextResponse.json({ error: 'error' }, { status: 500, headers: CORS })
  }
}
