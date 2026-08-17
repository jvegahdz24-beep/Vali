// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — AI Training / Coaching API
// GET  /api/training?workspaceId=  — list lessons (corrections + examples)
// POST /api/training               — create one, or bulk { examples: [...] }
// Requires agents.manage (owner/admin). The lessons are injected into the AI
// prompt by loadTrainingBlock(), so the AI applies them on every reply.
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'

interface ExampleInput {
  type?: string
  trigger?: string
  badResponse?: string | null
  goodResponse?: string
  note?: string | null
  source?: string
  sourceConversationId?: string | null
  sourceMessageId?: string | null
}

function normalizeType(t?: string): string {
  return t === 'example' ? 'example' : 'correction'
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const member = await requireWorkspace(workspaceId!, session.userId)
    requirePermission(member.role, 'agents.manage')

    const items = await db.aiTrainingExample.findMany({
      where: { workspaceId: workspaceId! },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const activeCount = items.filter((i) => i.isActive).length
    return Response.json({ items, total: items.length, activeCount })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const body = await req.json()
    const { workspaceId } = body
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'agents.manage')

    const rawList: ExampleInput[] = Array.isArray(body.examples) ? body.examples : [body]
    const valid = rawList
      .map((e) => ({
        type: normalizeType(e.type),
        trigger: (e.trigger || '').trim(),
        badResponse: e.badResponse?.trim() || null,
        goodResponse: (e.goodResponse || '').trim(),
        note: e.note?.trim() || null,
        source: e.source || 'playground',
        sourceConversationId: e.sourceConversationId || null,
        sourceMessageId: e.sourceMessageId || null,
      }))
      .filter((e) => e.trigger && e.goodResponse)

    if (valid.length === 0) {
      throw new ApiError(400, 'Cada lección necesita al menos el contexto del cliente y la respuesta correcta.')
    }

    await db.aiTrainingExample.createMany({
      data: valid.map((e) => ({ ...e, workspaceId, createdBy: session.userId })),
    })

    return Response.json({ success: true, created: valid.length })
  } catch (error) {
    return errorResponse(error)
  }
}
