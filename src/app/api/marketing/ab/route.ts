// A/B TESTING de creativos (F5, 2026-07-22)
// POST { workspaceId, carId, platform, count } → genera N variantes DISTINTAS de
// caption para el mismo auto, con enfoques diferentes (precio / emocional /
// urgencia), para que el usuario publique y compare rendimiento (via /metrics).
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { buildCarCreative } from '@/lib/marketing/creative'
import { generateCaption } from '@/lib/marketing/caption'

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, carId, platform, count } = await req.json() as { workspaceId: string; carId: string; platform?: string; count?: number }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!carId) throw new ApiError(400, 'Falta el auto')

    const [item, ws] = await Promise.all([
      db.catalogItem.findFirst({ where: { id: carId, workspaceId } }),
      db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, logo: true, settings: true } }),
    ])
    if (!item || !ws) throw new ApiError(404, 'Auto no encontrado')

    const creative = buildCarCreative(item, ws, baseUrl(req))
    const plat = platform === 'facebook' ? 'facebook' : 'instagram'
    const n = Math.min(3, Math.max(2, count || 2))
    // Cada variante siembra un "ejemplo" con un ángulo distinto para forzar
    // salidas diferenciadas (A = beneficio/emocional, B = precio/oferta, C = urgencia).
    const angles = [
      'Enfoque EMOCIONAL: cómo cambia la vida del comprador, aspiracional.',
      'Enfoque PRECIO/OFERTA: resalta el precio, enganche y facilidades de pago.',
      'Enfoque URGENCIA: pocas unidades, oportunidad que se va, llamado a actuar hoy.',
    ]
    const variants: { label: string; angle: string; text: string; hashtags: string[] }[] = []
    for (let i = 0; i < n; i++) {
      try {
        const r = await generateCaption(creative, plat, undefined, [angles[i]])
        variants.push({ label: String.fromCharCode(65 + i), angle: angles[i].split(':')[0], text: r.text, hashtags: r.hashtags })
      } catch { /* una variante puede fallar */ }
    }
    if (!variants.length) throw new ApiError(502, 'La IA no generó variantes. Intenta de nuevo.')
    return Response.json({ success: true, car: item.name, variants, hint: 'Publica 2 variantes y compara su rendimiento en Optimización → Rendimiento real en redes.' })
  } catch (error) { return errorResponse(error) }
}
