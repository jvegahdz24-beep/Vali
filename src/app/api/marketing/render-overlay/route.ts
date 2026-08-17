// ═══════════════════════════════════════════════════════════════
// GET /api/marketing/render-overlay?workspaceId=&carId=&kind=hook|spec|price|cta
//     &estilo=impacto|premium|dinamico|ficha&seed=&i=
// Renderiza el OVERLAY transparente (1080×1920) que el motor de video monta
// sobre las fotos reales del auto. Público como /render (lo consume el
// propio servidor al armar el reel).
// ═══════════════════════════════════════════════════════════════

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { loadFonts } from '@/lib/marketing/fonts'
import { buildCarCreative } from '@/lib/marketing/creative'
import { renderVideoOverlay, specForShot, isVideoStyle, type OverlayKind } from '@/lib/marketing/video-overlays'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function photoBase(): string {
  return `http://127.0.0.1:${process.env.PORT || 3105}`
}

const KINDS: OverlayKind[] = ['brand', 'hook', 'spec', 'price', 'cta']

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const workspaceId = sp.get('workspaceId')
    const carId = sp.get('carId')
    const kind = (sp.get('kind') || 'hook') as OverlayKind
    const estilo = sp.get('estilo') || 'impacto'
    const seed = parseInt(sp.get('seed') || '0', 10) || 0
    const i = parseInt(sp.get('i') || '0', 10) || 0
    if (!workspaceId || !carId) return new Response('Faltan parámetros', { status: 400 })
    if (!KINDS.includes(kind) || !isVideoStyle(estilo)) return new Response('kind/estilo inválido', { status: 400 })

    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) return new Response('No encontrado', { status: 404 })

    const c = buildCarCreative(item, ws, photoBase())
    const spec = specForShot(c, i, seed)
    const { element, width, height } = renderVideoOverlay(kind, estilo, c, { seed, spec, index: i })
    const fonts = await loadFonts()

    return new ImageResponse(element, {
      width,
      height,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return new Response(`Error overlay: ${e instanceof Error ? e.message : 'desconocido'}`, { status: 500 })
  }
}
