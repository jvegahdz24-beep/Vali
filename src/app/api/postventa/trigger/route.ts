// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Postventa Trigger API
// POST /api/postventa/trigger — Trigger post-sale sequence
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { triggerPostSaleSequence } from '@/lib/crm/postventa'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req)
    if (!session) {
      return errorResponse(new (await import('@/lib/api-auth')).ApiError(401, 'No autenticado'))
    }

    const body = await req.json()
    const { contactId, dealId } = body

    if (!contactId || !dealId) {
      return Response.json(
        { error: 'Missing required fields: contactId, dealId' },
        { status: 400 },
      )
    }

    await triggerPostSaleSequence(Number(contactId), Number(dealId))

    return Response.json({
      success: true,
      message: `Postventa sequence triggered for contact ${contactId}, deal ${dealId}`,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
