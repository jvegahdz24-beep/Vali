// ═══════════════════════════════════════════════════════════════
// ValiAutoFlow — Loyalty API
// GET  /api/loyalty/[contactId] — Get loyalty status
// POST /api/loyalty/[contactId] — Adjust points (admin only)
// ═══════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'
import { getLoyaltyStatus, addPoints } from '@/lib/crm/loyalty'
import { requireAuth, errorResponse } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await requireAuth(req)
    if (!session) {
      return errorResponse(new (await import('@/lib/api-auth')).ApiError(401, 'No autenticado'))
    }

    const { contactId } = await params
    if (!contactId) {
      return Response.json({ error: 'contactId es requerido' }, { status: 400 })
    }

    const status = await getLoyaltyStatus(Number(contactId))
    return Response.json({ success: true, data: status })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> },
) {
  try {
    const session = await requireAuth(req)
    if (!session) {
      return errorResponse(new (await import('@/lib/api-auth')).ApiError(401, 'No autenticado'))
    }

    const { contactId } = await params
    if (!contactId) {
      return Response.json({ error: 'contactId es requerido' }, { status: 400 })
    }

    const body = await req.json()
    const { points, reason } = body

    if (points === undefined || !reason) {
      return Response.json(
        { error: 'Missing required fields: points, reason' },
        { status: 400 },
      )
    }

    if (typeof points !== 'number') {
      return Response.json({ error: 'points must be a number' }, { status: 400 })
    }

    await addPoints(Number(contactId), points, reason)

    // Return updated status
    const status = await getLoyaltyStatus(Number(contactId))
    return Response.json({ success: true, data: status })
  } catch (error) {
    return errorResponse(error)
  }
}
