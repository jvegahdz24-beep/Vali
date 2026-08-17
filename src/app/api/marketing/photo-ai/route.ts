// Fotos publicitarias con IA (F6, 2026-07-22) — MiniMax image-01.
// POST { workspaceId, carId?, prompt?, style?, aspectRatio?, n?, useReference? }
//   → genera imagen(es) profesional(es) y devuelve enlaces persistidos.
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { generateAiImages, buildCarImagePrompt } from '@/lib/marketing/ai-image'

function localBase(): string { return `http://127.0.0.1:${process.env.PORT || 3105}` }

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json() as { workspaceId: string; carId?: string; prompt?: string; style?: string; aspectRatio?: string; n?: number; useReference?: boolean }
    const member = await requireWorkspace(body.workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')

    let prompt = (body.prompt || '').trim()
    let referenceImageUrl: string | undefined
    if (!prompt) {
      if (!body.carId) throw new ApiError(400, 'Dame un auto (carId) o un prompt.')
      const car = await db.catalogItem.findFirst({ where: { id: body.carId, workspaceId: body.workspaceId } })
      if (!car) throw new ApiError(404, 'Auto no encontrado')
      let meta: Record<string, unknown> = {}; try { meta = JSON.parse(car.metadata || '{}') } catch { /* */ }
      prompt = buildCarImagePrompt({ name: car.name, brand: (meta.marca as string) || null, year: Number(meta.year) || null, type: (meta.tipo as string) || null, color: (meta.color as string) || null }, body.style)
      // La foto real del auto como referencia (opcional)
      if (body.useReference && car.imageUrl) referenceImageUrl = car.imageUrl.startsWith('http') ? car.imageUrl : `${localBase()}${car.imageUrl}`
    }

    const images = await generateAiImages(prompt, body.workspaceId, {
      aspectRatio: body.aspectRatio || '1:1',
      n: Math.min(4, Math.max(1, body.n || 1)),
      referenceImageUrl,
    })
    return Response.json({ success: true, images, prompt })
  } catch (error) { return errorResponse(error) }
}
