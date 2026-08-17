// POST /api/marketing/brief — interpreta una petición en lenguaje natural
// y devuelve una config de diseño (color, plantilla, tono, música, etc.).
// Body: { workspaceId, text }. RBAC crm.write.

import { NextRequest } from 'next/server'
import { requireAuth, requireWorkspace, requirePermission, errorResponse, ApiError } from '@/lib/api-auth'
import { interpretBrief } from '@/lib/marketing/brief'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    const { workspaceId, text } = await req.json() as { workspaceId: string; text: string }
    const member = await requireWorkspace(workspaceId, session.userId)
    requirePermission(member.role, 'crm.write')
    if (!text?.trim()) throw new ApiError(400, 'Describe cómo quieres el contenido')
    return Response.json({ success: true, config: await interpretBrief(text.trim()) })
  } catch (error) { return errorResponse(error) }
}
