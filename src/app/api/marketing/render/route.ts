// ═══════════════════════════════════════════════════════════════
// GET /api/marketing/render?workspaceId=&carId=&format=feed|story&template=
// Renderiza un creativo PNG (foto real del auto + plantilla profesional)
// con Satori/next-og. Público a propósito: lo consumen las <img> del
// estudio y, en la fase de publicación, los servidores de Meta (que no
// envían cookies). Solo expone imágenes de marketing (de por sí públicas).
// ═══════════════════════════════════════════════════════════════

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { loadFonts } from '@/lib/marketing/fonts'
import { buildCarCreative } from '@/lib/marketing/creative'
import { renderCreative } from '@/lib/marketing/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Para incrustar fotos en el creativo, Satori las descarga server-side.
// Usamos el ORIGEN LOCAL (127.0.0.1) para fotos relativas: evita el loopback
// al dominio público (TLS/proxy) que falla desde el propio servidor.
function photoBase(): string {
  return `http://127.0.0.1:${process.env.PORT || 3105}`
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const workspaceId = sp.get('workspaceId')
    const carId = sp.get('carId')
    const format = (sp.get('format') === 'story' ? 'story' : 'feed') as 'feed' | 'story'
    const template = sp.get('template') || (format === 'story' ? 'historia' : 'clasica')
    if (!workspaceId || !carId) return new Response('Faltan parámetros', { status: 400 })

    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) return new Response('No encontrado', { status: 404 })

    const accent = sp.get('accent')
    const wm = sp.get('wm')
    const creative = buildCarCreative(item, ws, photoBase(), {
      ...(accent ? { accent: accent.startsWith('#') ? accent : `#${accent}` } : {}),
      ...(wm === '0' ? { hideBrand: true } : {}),
    })
    const { element, width, height } = renderCreative(format, template, creative)
    const fonts = await loadFonts()

    return new ImageResponse(element, {
      width,
      height,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  } catch (e) {
    return new Response(`Error al generar imagen: ${e instanceof Error ? e.message : 'desconocido'}`, { status: 500 })
  }
}
