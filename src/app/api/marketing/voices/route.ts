// GET /api/marketing/voices — voces de locución disponibles + si TTS está activo.

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, errorResponse } from '@/lib/api-auth'
import { VOICES, ttsAvailable } from '@/lib/marketing/tts'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    await requireWorkspace(req.nextUrl.searchParams.get('workspaceId') || '', session.userId)
    return Response.json({ voices: VOICES, available: ttsAvailable() })
  } catch (error) { return errorResponse(error) }
}
