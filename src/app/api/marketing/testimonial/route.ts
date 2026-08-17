// Creativo de TESTIMONIO / prueba social (F10, 2026-07-22).
// GET ?workspaceId=&quote=&author=&rating=&accent= → PNG 1080x1080.
// Público (lo consumen <img> del estudio y los servidores de Meta al publicar).
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { loadFonts } from '@/lib/marketing/fonts'
import { testimonialCreative } from '@/lib/marketing/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const workspaceId = sp.get('workspaceId')
    const quote = sp.get('quote') || ''
    const author = sp.get('author') || 'Cliente satisfecho'
    if (!workspaceId || !quote) return new Response('Faltan parámetros (workspaceId, quote)', { status: 400 })

    const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } })
    if (!ws) return new Response('No encontrado', { status: 404 })
    let accent = sp.get('accent') || ''
    if (!accent) { try { accent = JSON.parse(ws.settings || '{}').marketing?.accent || '' } catch { /* */ } }

    const { element, width, height } = testimonialCreative({
      dealerName: ws.name || 'Nuestra agencia',
      logo: ws.logo,
      accent: accent ? (accent.startsWith('#') ? accent : `#${accent}`) : undefined,
      quote,
      author,
      rating: Math.max(1, Math.min(5, Number(sp.get('rating')) || 5)),
    })
    const fonts = await loadFonts()
    return new ImageResponse(element, {
      width, height,
      fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  } catch (e) {
    return new Response(`Error al generar testimonio: ${e instanceof Error ? e.message : 'desconocido'}`, { status: 500 })
  }
}
